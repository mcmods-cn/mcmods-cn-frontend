import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import type { Page } from "playwright";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
const origin = "https://api.example.test";
const cookieName = "mcmods_session";
const conditionalPath = "/api/v1/auth/logout/if-current";
const legacyPath = "/api/v1/auth/logout";
const signoutMessage = "The server hasn’t confirmed sign-out. Please retry.";
before(() => fixture.start(undefined, ["--disable-local-storage"]));
after(() => fixture.close());

type SyntheticSession = { account: string; marker: string; active: boolean };
type LogoutWrite = { path: string; presentedMarker: string | undefined; currentMarker: string | undefined; status: number };

async function scenario(legacy = false) {
  const sessions = new Map<string, SyntheticSession>();
  const writes: LogoutWrite[] = [];
  const mode = { failNext: false, rollback: legacy };
  let reads = 0;
  const user = (account: string) => ({
    id: `fixture-${account}`, username: `Test account ${account}`, email: `${account}@example.invalid`,
    roleCodes: ["fixture"], permissionRules: [{ code: "*", allow: true, priority: 100 }], permissionVersion: 1, rbacVersion: 1,
  });
  const handler: APIHandler = ({ method, path, headers, body }) => {
    const cookie = headers.cookie?.split("; ").find(pair => pair.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
    const session = cookie ? sessions.get(cookie) : undefined;
    if (path === "/api/v1/auth/login" && method === "POST") {
      const { account } = JSON.parse(body) as { account: string };
      assert(["A", "B"].includes(account));
      const credential = randomUUID();
      const marker = createHash("sha256").update(credential).digest("base64url");
      sessions.set(credential, { account, marker, active: true });
      return {
        data: { user: user(account), ...(!mode.rollback && { sessionMarker: marker }) },
        headers: { "Set-Cookie": `${cookieName}=${credential}; Path=/api/v1; HttpOnly; Secure; SameSite=Lax` },
      };
    }
    if (path === "/api/v1/auth/me") {
      reads++;
      return session?.active
        ? { data: { ...user(session.account), ...(!mode.rollback && { sessionMarker: session.marker }) } }
        : { status: 401, error: "Synthetic guest" };
    }
    if ((path === conditionalPath || path === legacyPath) && method === "POST") {
      const presentedMarker = body ? JSON.parse(body).sessionMarker as string | undefined : undefined;
      let status = 200;
      if (path === conditionalPath && mode.rollback) status = 404;
      else if (!session?.active) status = 401;
      else if (path === conditionalPath && presentedMarker !== session.marker) status = 409;
      else if (mode.failNext) status = 503;
      mode.failNext = false;
      writes.push({ path, status, presentedMarker, currentMarker: session?.marker });
      if (status !== 200) return { status, error: "Synthetic sign-out response", code: status === 409 ? "AUTH_SESSION_CHANGED" : undefined };
      session!.active = false;
      return { data: { ok: true } };
    }
  };
  const run = await fixture.page(handler);
  const context = run.page.context();
  await context.addCookies([{ name: "mcmods-ui-locale", value: "en-US", url: origin }]);
  // Use one secure browser origin for the real pages, API and HttpOnly cookie.
  // Every document/asset comes from the isolated standalone server on loopback.
  let closing = false;
  const forwardedDocuments = new Set<Promise<void>>();
  await context.route(url => url.origin === origin && !url.pathname.startsWith("/api/") && url.pathname !== "/ready", async route => {
    if (closing) {
      await route.abort();
      return;
    }
    const url = new URL(route.request().url());
    const forwarded = route.fetch({ url: fixture.origin + url.pathname + url.search, maxRedirects: 0 })
      .then(response => route.fulfill({ response }));
    forwardedDocuments.add(forwarded);
    try {
      await forwarded;
    } finally {
      forwardedDocuments.delete(forwarded);
    }
  });
  async function current() {
    const cookie = (await context.cookies(origin + "/api/v1/auth/me")).find(item => item.name === cookieName);
    assert(cookie?.httpOnly && cookie.secure);
    return sessions.get(cookie.value)!;
  }
  return {
    page: run.page, mode, writes, reads: () => reads, current,
    async close() {
      // Keep routes installed until the owned document and RSC forwards settle.
      closing = true;
      try {
        await Promise.all(forwardedDocuments);
        await context.unrouteAll({ behavior: "wait" });
      } finally {
        await run.close();
      }
    },
  };
}

const accountVisible = (page: Page, account: string) => page.getByText(new RegExp(`^Test account ${account} /`)).waitFor();
async function login(page: Page, account: string) {
  await page.goto(origin + "/login?next=/admin");
  const form = page.locator("form").first();
  await form.getByPlaceholder("Email / username / user ID").fill(account);
  await form.locator('input[type="password"]').fill("synthetic-only");
  await form.locator('button[type="submit"]').click();
  await accountVisible(page, account);
}
const click = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();

for (const replacement of ["A", "B"]) {
  test(`without shared storage the original tab preserves a replacement login for account ${replacement}`, { timeout: 30_000 }, async () => {
    const f = await scenario();
    try {
      const a = f.page;
      await login(a, "A");
      const original = await f.current();
      assert.deepEqual(await a.evaluate(() => {
        let shared = false;
        try { localStorage.setItem("fixture-probe", "1"); shared = localStorage.getItem("fixture-probe") === "1"; } catch { /* Native denial. */ }
        sessionStorage.setItem("fixture-probe", "1");
        return [shared, sessionStorage.getItem("fixture-probe") === "1", typeof navigator.locks?.request === "function"];
      }), [false, true, true]);
      f.mode.failNext = true;
      await click(a, "Log out");
      await a.getByText(signoutMessage).waitFor();
      const reads = f.reads();
      await a.goto(origin + "/login?oauth=success&next=/admin");
      await a.waitForURL(origin + "/login");
      await a.getByText(signoutMessage).waitFor();
      assert.equal(f.reads(), reads, "reopening an old OAuth callback must respect the original tab’s intent");
      await a.goto(origin + "/admin");
      await a.getByText(signoutMessage).waitFor();
      const b = await a.context().newPage();
      await login(b, replacement);
      const latest = await f.current();
      assert.notEqual(original.marker, latest.marker, "same-account logins also receive distinct session markers");
      await click(a, "Retry");
      await accountVisible(a, replacement);
      await accountVisible(b, replacement);
      assert.deepEqual(f.writes.map(w => [w.path, w.status]), [[conditionalPath, 503], [conditionalPath, 409]]);
      assert(f.writes.every(w => w.presentedMarker === original.marker));
      assert.equal(f.writes[1].currentMarker, latest.marker);
      assert.equal((await f.current()).active, true);
    } finally { await f.close(); }
  });
}

test("a legacy replica never receives an unconditional replay, even if the same user has signed in again", { timeout: 25_000 }, async () => {
  const f = await scenario();
  try {
    await login(f.page, "A");
    f.mode.failNext = true;
    await click(f.page, "Log out");
    await f.page.getByText(signoutMessage).waitFor();
    f.mode.rollback = true;
    const b = await f.page.context().newPage();
    await login(b, "A");
    const latest = await f.current();
    await click(f.page, "Retry");
    const inspect = f.page.getByRole("button", { name: "Check current account" });
    await inspect.waitFor();
    assert.equal(await f.page.getByRole("button", { name: "Sign out the current browser session" }).count(), 0);
    await inspect.click();
    await accountVisible(f.page, "A");
    assert.deepEqual(f.writes.map(w => [w.path, w.status]), [[conditionalPath, 503], [conditionalPath, 404]]);
    assert.equal(await f.current(), latest);
    assert(latest.active);
  } finally { await f.close(); }
});

test("a fresh legacy sign-out offers an explicit current-browser choice and a read-only recovery", { timeout: 25_000 }, async () => {
  const f = await scenario(true);
  try {
    await login(f.page, "A");
    await click(f.page, "Log out");
    await f.page.getByRole("button", { name: "Check current account" }).waitFor();
    assert.equal(f.writes.length, 0);
    f.mode.failNext = true;
    await click(f.page, "Sign out the current browser session");
    await f.page.getByRole("button", { name: "Check current account" }).waitFor();
    await f.page.reload();
    assert.equal(await f.page.getByRole("button", { name: "Sign out the current browser session" }).count(), 0);
    const b = await f.page.context().newPage();
    await login(b, "B");
    await click(f.page, "Check current account");
    await accountVisible(f.page, "B");
    assert.deepEqual(f.writes.map(w => [w.path, w.status]), [[legacyPath, 503]]);
    assert((await f.current()).active);
  } finally { await f.close(); }
});
