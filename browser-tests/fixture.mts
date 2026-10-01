import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { access, cp } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:net";
import { createServer as createHTTPServer, type Server as HTTPServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser, type Page, type Route } from "playwright";

const repository = fileURLToPath(new URL("../", import.meta.url));
export type APIReply = { data?: unknown; error?: string; code?: string; retryAfter?: number; details?: unknown; status?: number; headers?: Record<string, string>; contentType?: string; bytes?: Uint8Array };
export type APIHandler = (request: { path: string; method: string; body: string; url: URL; headers: Record<string, string> }) => Promise<APIReply | undefined> | APIReply | undefined;

// Node:test remains the only test runner; Playwright is the browser driver.
// This starts the real production build. No test-only production routes or
// rewritten copies of components are used. API fixtures are explicitly mocked.
export class ProductionBrowserFixture {
  private application?: ChildProcess;
  private browser?: Browser;
  private output = "";
  private diagnosticPage = 0;
  private transportServer?: HTTPServer;
  private transportOrigin = "";
  private transportErrors: string[] = [];
  origin = "";

  async start(serverAPI?: APIHandler) {
    if (serverAPI) {
      this.transportServer = createHTTPServer(async (request, response) => {
        try {
          const chunks: Buffer[] = [];
          let received = 0;
          for await (const chunk of request) {
            received += chunk.length;
            if (received > 2 * 1024 * 1024) throw new Error("Unexpected test provider body budget");
            chunks.push(Buffer.from(chunk));
          }
          const url = new URL(request.url ?? "/", this.transportOrigin);
          const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(",") : value ?? ""]));
          const reply = await serverAPI({ path: url.pathname, method: request.method ?? "GET", url, body: Buffer.concat(chunks).toString("binary"), headers });
          if (!reply) throw new Error(`Unexpected owned server API endpoint: ${request.method} ${url.pathname}`);
          const result = reply;
          response.writeHead(result.status ?? 200, { "Content-Type": result.contentType ?? "application/json", ...result.headers });
          response.end(result.bytes ? Buffer.from(result.bytes) : JSON.stringify(result.error ? { error: result.error, code: result.code, retryAfter: result.retryAfter, details: result.details } : { data: result.data }));
        } catch (error) {
          this.transportErrors.push(error instanceof Error ? error.stack ?? error.message : String(error));
          response.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "Owned test provider failed" }));
        }
      });
      this.transportServer.listen(0, "127.0.0.1");
      await once(this.transportServer, "listening");
      const address = this.transportServer.address();
      assert(address && typeof address !== "string");
      this.transportOrigin = `http://127.0.0.1:${address.port}`;
    }
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const address = reservation.address();
    assert(address && typeof address !== "string");
    const port = address.port;
    await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
    this.origin = `http://127.0.0.1:${port}`;
    // Exercise the same standalone artifact shipped by Docker. Next's local
    // output documentation explicitly disallows `next start` for this mode.
    const standalone = join(repository, ".next", "standalone");
    await access(join(standalone, "server.js"));
    await cp(join(repository, "public"), join(standalone, "public"), { recursive: true });
    await cp(join(repository, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
    this.application = spawn(process.execPath, [
      ...(process.env.MCMODS_BROWSER_DIAGNOSTICS ? ["--import", pathToFileURL(join(repository, "browser-tests", "server-network-diagnostic.mjs")).href] : []),
      ...(serverAPI ? ["--import", pathToFileURL(join(repository, "browser-tests", "server-api-transport.mjs")).href] : []),
      join(standalone, "server.js"),
    ], {
      cwd: repository,
      windowsHide: true,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        ...(serverAPI ? { MCMODS_TEST_API_ORIGIN: this.transportOrigin } : {}),
        NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.example.test",
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "https://www.example.test",
        NEXT_PUBLIC_YGGDRASIL_API_ROOT: process.env.NEXT_PUBLIC_YGGDRASIL_API_ROOT || "https://api.example.test/api/yggdrasil/",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const capture = (chunk: Buffer) => { this.output = (this.output + chunk.toString()).slice(-32_768); };
    this.application.stdout?.on("data", capture);
    this.application.stderr?.on("data", capture);
    this.application.on("error", error => { this.output += error.message; });
    try {
      const deadline = Date.now() + 15_000;
      let ready = false;
      while (Date.now() < deadline) {
        if (this.application.exitCode !== null) throw new Error(`Production server exited: ${this.output}`);
        try {
          const response = await fetch(`${this.origin}/login`, { signal: AbortSignal.timeout(1000) });
          ready = response.ok;
          await response.body?.cancel();
        } catch { /* Startup polling is bounded; failure remains a hard error. */ }
        if (ready) break;
        await delay(50);
      }
      assert(ready, `Production server was not ready: ${this.output}`);
      this.browser = await chromium.launch({ headless: true, ...(process.env.MCMODS_BROWSER_CHANNEL ? { channel: process.env.MCMODS_BROWSER_CHANNEL } : {}) });
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async page(handler: APIHandler) {
    assert(this.browser, "Call start before creating a page");
    const context = await this.browser.newContext({ locale: "en-US", serviceWorkers: "block" });
    await context.addCookies([{ name: "mcmods-ui-locale", value: "en-US", url: this.origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const diagnosticEvents: Array<{ ms: number; event: string; url?: string }> = [];
    const diagnosticStart = Date.now();
    const diagnosticID = ++this.diagnosticPage;
    if (process.env.MCMODS_BROWSER_DIAGNOSTICS) {
      await context.tracing.start({ snapshots: true, sources: true });
      page.on("request", request => diagnosticEvents.push({ ms: Date.now() - diagnosticStart, event: "request", url: request.url() }));
      page.on("requestfinished", request => diagnosticEvents.push({ ms: Date.now() - diagnosticStart, event: "finished", url: request.url() }));
      page.on("requestfailed", request => diagnosticEvents.push({ ms: Date.now() - diagnosticStart, event: `failed:${request.failure()?.errorText}`, url: request.url() }));
      page.on("domcontentloaded", () => diagnosticEvents.push({ ms: Date.now() - diagnosticStart, event: "domcontentloaded" }));
      page.on("load", () => diagnosticEvents.push({ ms: Date.now() - diagnosticStart, event: "load" }));
    }
    const errors: string[] = [];
    const unexpected: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    // Leave the real application document, streamed RSC and static assets on
    // their native network path. Only external API/provider transports are
    // substitutes, not the document or production asset transport itself.
    await context.route(url => url.origin !== this.origin && url.origin !== this.transportOrigin, async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === "OPTIONS") { await this.fulfill(route, { data: {} }); return; }
      const reply = await handler({ path: url.pathname, url, method: request.method(), body: request.postData() || "", headers: await request.allHeaders() });
      if (reply) { await this.fulfill(route, reply); return; }
      if (!url.pathname.startsWith("/api/v1/") && url.pathname !== "/ready") { await route.abort(); return; }
      if (url.pathname === "/api/v1/realtime/events") {
        await route.fulfill({ contentType: "text/event-stream", headers: { "access-control-allow-origin": this.origin, "access-control-allow-credentials": "true" }, body: ": browser fixture\n\n" });
        return;
      }
      const baseline = baselineAPI(url.pathname);
      if (baseline === undefined) unexpected.push(`${request.method()} ${url.pathname}`);
      await this.fulfill(route, baseline === undefined ? { status: 500, error: "Unexpected browser fixture endpoint" } : { data: baseline });
    });
    return {
      page,
      close: async () => {
        if (process.env.MCMODS_BROWSER_DIAGNOSTICS) {
          console.error("Owned browser page diagnostic", { diagnosticID, events: diagnosticEvents, serverOutput: this.output });
          await context.tracing.stop({ path: `${process.env.MCMODS_BROWSER_DIAGNOSTICS}-${process.pid}-${diagnosticID}.zip` });
        }
        await context.close();
        assert.deepEqual(errors, [], "The real React page must not throw");
        assert.deepEqual(unexpected, [], "Every API fixture endpoint must be intentional");
      },
    };
  }

  private async fulfill(route: Route, reply: APIReply) {
    await route.fulfill({
      status: reply.status || 200,
      contentType: reply.contentType ?? "application/json",
      headers: {
        "access-control-allow-origin": this.origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "Content-Type,Authorization,X-Client-ID,X-Request-ID",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        ...reply.headers,
      },
      body: reply.bytes ? Buffer.from(reply.bytes) : JSON.stringify(reply.error ? { error: reply.error, code: reply.code, retryAfter: reply.retryAfter, details: reply.details } : { data: reply.data }),
    });
  }

  async close() {
    await this.browser?.close();
    if (this.application && this.application.exitCode === null) {
      const exited = once(this.application, "exit");
      this.application.kill();
      await exited;
    }
    if (this.transportServer) {
      this.transportServer.closeAllConnections();
      await new Promise<void>((resolve, reject) => this.transportServer!.close(error => error ? reject(error) : resolve()));
    }
    assert.deepEqual(this.transportErrors, [], "Owned server API assertions must not be hidden as HTTP errors");
  }
}

function baselineAPI(path: string): unknown {
  switch (path) {
    case "/ready": return { status: "ready" };
    case "/api/v1/auth/me": return { id: "test048u1", username: "Test reviewer", email: "test048@example.invalid", roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: [{ code: "*", allow: true, priority: 100 }] };
    case "/api/v1/site/config": return { siteName: "MCMods browser test", logoUrl: "" };
    case "/api/v1/site/presence": return { online: true };
    case "/api/v1/me/unread-summary": return { total: 0 };
    case "/api/v1/admin/config": return { general: { siteName: "Test", logoUrl: "" }, features: {} };
    case "/api/v1/admin/permissions": return { roles: [], permissions: [] };
    case "/api/v1/admin/users": return [];
    case "/api/v1/admin/dashboard": return { cards: [], overview: { onlineUsers: 0, monthlyActiveUsers: 0, totalUsers: 0, totalProjects: 0, approvedProjects: 0, pendingReviews: 0, viewsToday: 0, actionsToday: 0, oss: { activeFiles: 0, storedBytes: 0, sourceBytes: 0, pendingScans: 0, quarantinedFiles: 0, uploadsToday: 0 }, trend: [], updatedAt: "" } };
    case "/api/v1/admin/ban-reasons": return { locale: "en-US", items: [{ code: "harassment", label: "Harassment", sortOrder: 1 }] };
    default: return undefined;
  }
}

export async function navigateAdminPanel(page: Page, origin: string, label: string, group = "Reviews") {
  await page.goto(`${origin}/admin`);
  await page.getByRole("button", { name: /^Workbench/ }).waitFor();
  const panel = page.getByRole("button", { name: new RegExp(`^${label}`) });
  // Groups are collapsible. Open the real containing group if needed.
  if (await panel.count() === 0) await page.getByRole("button", { name: new RegExp(`^${group}`) }).click();
  await panel.click();
}
