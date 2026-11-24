import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

test("a failed dashboard leaves navigation and settings usable; an unread settings snapshot cannot be saved", { timeout: 30_000 }, async () => {
  let settingsAvailable = false;
  let configReads = 0;
  const unrelatedReads: string[] = [];
  const writes: string[] = [];
  const browser = await fixture.page(({ path, method }) => {
    if (method !== "GET" && path.startsWith("/api/v1/admin/")) writes.push(path);
    if (path === "/api/v1/admin/dashboard") return { status: 503, error: "Synthetic dashboard outage" };
    if (path === "/api/v1/site/config") {
      configReads++;
      return settingsAvailable
        ? { data: { siteName: "Saved site name", logoUrl: "" } }
        : { status: 503, error: "Synthetic settings outage" };
    }
    if (path === "/api/v1/admin/users" || path === "/api/v1/admin/permissions" || path === "/api/v1/admin/ai/config") {
      unrelatedReads.push(path);
      return { status: 503, error: "An unrelated panel was fetched" };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="system"]').click();
    await page.locator('[data-admin-panel="general-settings"]').click();
    const panel = page.locator("main section").filter({ has: page.getByRole("heading", { level: 1 }) }).last();
    await panel.getByRole("alert").waitFor();
    assert.equal(await panel.locator("form, input").count(), 0);
    const attempts = configReads;
    settingsAvailable = true;
    await panel.getByRole("button", { name: "Retry", exact: true }).click();
    const name = panel.getByRole("textbox", { name: "Site name", exact: true });
    await name.waitFor();
    assert.equal(await name.inputValue(), "Saved site name");
    await name.fill("Unsaved site name");
    assert.equal(configReads, attempts + 1);
    assert.deepEqual(writes, []);
    assert.deepEqual(unrelatedReads, []);
    assert.equal(await name.inputValue(), "Unsaved site name");
    assert.equal(new URL(page.url()).pathname, "/admin");
  } finally { await browser.close(); }
});


test("a late role-catalog failure preserves the active user draft and retries only its suggestions", { timeout: 30_000 }, async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let catalogReads = 0;
  let userReads = 0;
  let writes = 0;
  const browser = await fixture.page(async ({ path, method }) => {
    if (method !== "GET" && path.startsWith("/api/v1/admin/")) writes++;
    if (path === "/api/v1/admin/users") { userReads++; return { data: [] }; }
    if (path === "/api/v1/admin/permissions") {
      if (++catalogReads === 1) { started.resolve(); await release.promise; return { status: 503, error: "Synthetic role catalog outage" }; }
      return { data: { permissions: [], roles: [] } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="users"]').click();
    await page.locator('[data-admin-panel="users"]').click();
    await started.promise;
    const username = page.locator('input[name="username"]');
    await username.fill("draft-reviewer");
    release.resolve();
    const failure = page.getByRole("alert").filter({ has: page.getByRole("button", { name: "Retry", exact: true }) });
    await failure.waitFor();
    assert.equal(await username.inputValue(), "draft-reviewer");
    const retried = page.waitForResponse(response => response.url().endsWith("/api/v1/admin/permissions"));
    await failure.getByRole("button").click();
    await retried;
    await failure.waitFor({ state: "detached" });
    assert.equal(await username.inputValue(), "draft-reviewer");
    assert.deepEqual({ catalogReads, userReads, writes }, { catalogReads: 2, userReads: 1, writes: 0 });
  } finally { release.resolve(); await browser.close(); }
});

test("revoking a settings read removes the editor and ignores the actor's late response", { timeout: 30_000 }, async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  let version = 1;
  let writes = 0;
  const browser = await fixture.page(async ({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: {
      id: "reviewer01", username: "Synthetic reviewer", roleCodes: [], permissionVersion: version, rbacVersion: 1,
      permissionRules: [{ code: "admin.access", allow: true, priority: 1 }, ...(version === 1 ? [{ code: "admin.config.read", allow: true, priority: 1 }] : [])],
    } };
    if (method !== "GET" && path.startsWith("/api/v1/admin/")) writes++;
    if (path === "/api/v1/admin/config/profile") {
      started.resolve(); await release.promise; finished.resolve();
      return { data: { signatureMaxBytes: 5173 } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="system"]').click();
    await page.locator('[data-admin-panel="profile-settings"]').click();
    await started.promise;
    version = 2;
    await page.evaluate(() => window.dispatchEvent(new Event("mcmods-permissions-changed")));
    await page.locator('[data-admin-panel="profile-settings"]').waitFor({ state: "detached" });
    release.resolve(); await finished.promise;
    assert.equal(await page.locator('input[value="5173"]').count(), 0);
    assert.equal(writes, 0);
  } finally { release.resolve(); await browser.close(); }
});

test("mail settings preserve disabled delivery on edit and confirm the saved state", { timeout: 30_000 }, async () => {
  const snapshot = { enabled: false, host: "mail.example.invalid", port: 587, username: "fixture", from: "admin@example.invalid", useTLS: true, hasPassword: false };
  const writes: Array<{ enabled: boolean; host: string }> = [];
  let attempts = 0;
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/config/mail") {
      if (method === "GET") return { data: snapshot };
      const draft = JSON.parse(body) as typeof snapshot;
      writes.push({ enabled: draft.enabled, host: draft.host });
      return { data: { ...draft, hasPassword: false } };
    }
    if (path === "/api/v1/admin/mail/test") { attempts++; return { data: { sent: true } }; }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="system"]').click();
    await page.locator('[data-admin-panel="mail"]').click();
    const enabled = page.locator('input[name="enabled"]');
    await enabled.waitFor();
    assert.equal(await enabled.isChecked(), false);
    await page.locator('input[name="host"]').fill("changed.example.invalid");
    const submit = page.locator('form button[type="submit"]');
    const saved = page.waitForResponse(r => r.url().endsWith("/api/v1/admin/config/mail") && r.request().method() === "PUT");
    await submit.click();
    await saved;
    await page.getByText("changed.example.invalid", { exact: true }).waitFor();
    assert.deepEqual(writes, [{ enabled: false, host: "changed.example.invalid" }]);
    assert.equal(attempts, 0);
  } finally { await browser.close(); }
});

test("SMTP destination changes require an explicit saved password decision", { timeout: 30_000 }, async () => {
  let config = { enabled: false, host: "mail.example.invalid", port: 587, username: "Sender", from: "", useTLS: true, hasPassword: true };
  const writes: Array<Record<string, unknown>> = [];
  let mail = 0;
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/mail/test") { mail++; return { data: {} }; }
    if (path !== "/api/v1/admin/config/mail") return;
    if (method === "GET") return { data: config };
    const input = JSON.parse(body);
    writes.push(input);
    if (writes.length === 1) return { status: 400, code: "MAIL_PASSWORD_DECISION_REQUIRED", error: "Destination changed" };
    config = { ...config, host: input.host, port: input.port, username: input.username, hasPassword: !input.clearPassword };
    return { data: config };
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/admin");
    await page.locator('[data-admin-group="system"]').click();
    await page.locator('[data-admin-panel="mail"]').click();
    const save = page.getByRole("button", { name: "Save mail config", exact: true });
    const host = page.locator('[name="host"]'), username = page.locator('[name="username"]'), password = page.locator('[name="password"]');
    await host.fill("MAIL.EXAMPLE.INVALID");
    assert.equal(await save.isEnabled(), true);
    await password.fill("only-for-original-destination");
    await host.fill("new.example.invalid");
    assert.equal(await password.inputValue(), "");
    assert.equal(await save.isDisabled(), true);
    await password.fill("replacement-for-new-destination");
    await save.click();
    const notices = page.getByRole("alertdialog");
    await notices.filter({ hasText: "For a different mail server" }).getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled === false);
    assert.equal(await password.inputValue(), "replacement-for-new-destination");
    await save.click();
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[name="password"]')?.value === "");
    await notices.getByRole("button", { name: "Close" }).click();
    await username.fill("Sender ");
    assert.equal(await save.isDisabled(), true);
    await page.getByRole("checkbox", { name: "Clear the saved password" }).check();
    assert.equal(await password.isDisabled(), true);
    await save.click();
    await page.getByRole("checkbox", { name: "Clear the saved password" }).waitFor({ state: "detached" });
    assert.deepEqual(writes.map(value => [value.host, value.username, value.password, value.clearPassword]), [
      ["new.example.invalid","Sender","replacement-for-new-destination",undefined],
      ["new.example.invalid","Sender","replacement-for-new-destination",undefined],
      ["new.example.invalid","Sender ",undefined,true],
    ]);
    assert.equal(mail, 0);
  } finally { await browser.close(); }
});

test("partial Markdown settings cannot populate a writable form; a read-only account can inspect the saved mail settings", { timeout: 30_000 }, async () => {
  const reads: string[] = [];
  let writes = 0;
  const browser = await fixture.page(({ path, method }) => {
    if (path === "/api/v1/auth/me") return { data: {
      id: "reader01", username: "Settings reader", roleCodes: [], permissionVersion: 1, rbacVersion: 1,
      permissionRules: ["admin.access", "admin.config.read"].map(code => ({ code, allow: true, priority: 1 })),
    } };
    if (method !== "GET" && path.startsWith("/api/v1/admin/")) writes++;
    if (path === "/api/v1/admin/config/markdown") { reads.push("markdown"); return { data: {} }; }
    if (path === "/api/v1/admin/config/mail") {
      reads.push("mail");
      return { data: { enabled: false, host: "inspect.example.invalid", port: 587, username: "", from: "", useTLS: true, hasPassword: false } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="system"]').click();
    await page.locator('[data-admin-panel="markdown"]').click();
    await page.getByRole("alert").filter({ has: page.getByRole("button", { name: "Retry", exact: true }) }).waitFor();
    assert.equal(await page.locator('main input').count(), 0);
    await page.locator('[data-admin-panel="mail"]').click();
    const host = page.locator('input[name="host"]');
    await host.waitFor();
    assert.equal(await host.inputValue(), "inspect.example.invalid");
    assert.equal(await host.isDisabled(), true);
    assert.equal(await page.locator('form button[type="submit"]').isDisabled(), true);
    assert.deepEqual(reads, ["markdown", "mail"]);
    assert.equal(writes, 0);
  } finally { await browser.close(); }
});

test("overview requests only dashboard metrics, then retries feature flags without reloading the dashboard", { timeout: 30_000 }, async () => {
  const requests: string[] = [];
  const browser = await fixture.page(({ path, method }) => {
    if (!path.startsWith("/api/v1/admin/") || method !== "GET") return;
    requests.push(path);
    if (path === "/api/v1/admin/config/features") {
      return requests.filter(value => value === path).length === 1
        ? { status: 503, error: "Synthetic feature flag read failed" }
        : { data: { redis: false } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.getByText("All projects", { exact: true }).waitFor();
    assert.deepEqual(requests, ["/api/v1/admin/dashboard"]);
    const settings = page.locator("details").filter({ has: page.locator("summary") });
    await settings.locator("summary").click();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await settings.getByText("redis", { exact: true }).waitFor();
    assert.deepEqual(requests, ["/api/v1/admin/dashboard", "/api/v1/admin/config/features", "/api/v1/admin/config/features"]);
  } finally { await browser.close(); }
});

test("the collapsed mobile admin header leaves the failed panel and its retry directly below it", { timeout: 30_000 }, async () => {
  const browser = await fixture.page(({ path }) => {
    if (path === "/api/v1/admin/dashboard") return { status: 503, error: "Synthetic dashboard outage" };
  }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    const retry = page.getByRole("alert").getByRole("button", { name: "Retry", exact: true });
    await retry.waitFor();
    const header = page.locator("aside");
    const sizes = await header.evaluate(aside => {
      const bar = aside.querySelector('button[aria-controls="admin-navigation"]')?.parentElement;
      return { aside: aside.getBoundingClientRect().height, bar: bar?.getBoundingClientRect().height ?? 0 };
    });
    assert(sizes.bar > 0 && sizes.aside <= sizes.bar + 2, "Collapsed mobile navigation should occupy only the header and its border");
    const menu = header.locator('button[aria-controls="admin-navigation"]');
    await menu.click();
    await page.locator('[data-admin-panel="projects"]').waitFor();
    await menu.click();
    await page.locator('[data-admin-panel="projects"]').waitFor({ state: "hidden" });
    assert.equal(await retry.isVisible(), true);
  } finally { await browser.close(); }
});

for (const supportsCapacity of [true, false]) {
  test(`the queue panel sends only explicitly edited stream budgets (server supports capacity=${supportsCapacity})`, { timeout: 25_000 }, async () => {
    const writes: Array<{ revision: string; jetStream: { newStreamMaxBytes?: number }; outboxEnabled: boolean }> = [];
    const settings = {
      revision: "a".repeat(64), enabled: false, url: "nats://queue.example.invalid:4222", username: "", hasPassword: false, hasToken: false, subjectPrefix: "mcmods", tasks: [], outboxEnabled: true, realtime: false,
      jetStream: { enabled: false, stream: "MCMODS_TASKS", maxDeliver: 8, ackWaitSeconds: 300, publishTimeoutSeconds: 5, ...(supportsCapacity ? { newStreamMaxBytes: 256 * 1024 * 1024 } : {}) },
      status: { enabled: false, connected: false, jetStream: false, url: "", subjectPrefix: "mcmods", tasks: [] },
    };
    const browser = await fixture.page(({ path, method, body }) => {
      if (path === "/api/v1/admin/infrastructure/dead-letters") return { data: { items: [], hasMore: false, nextCursor: "", limit: 50 } };
      if (path === "/api/v1/admin/config/nats") {
        if (method === "PUT") {
          const write = JSON.parse(body) as typeof writes[number];
          writes.push(write);
          if (write.jetStream.newStreamMaxBytes !== undefined) settings.jetStream.newStreamMaxBytes = write.jetStream.newStreamMaxBytes;
        }
        return { data: settings };
      }
    });
    try {
      const { page } = browser;
      await page.goto(`${fixture.origin}/admin`);
      await page.locator('[data-admin-group="infrastructure"]').click();
      await page.locator('[data-admin-panel="nats"]').click();
      const save = page.getByRole("button", { name: "Save NATS settings", exact: true });
      await save.waitFor();
      const size = page.getByRole("spinbutton", { name: "New stream capacity (MiB)", exact: true });
      if (supportsCapacity) {
        assert.equal(await size.inputValue(), "256");
        await size.fill("0");
        assert.equal(await save.isDisabled(), true);
        await size.fill("32.5");
      } else assert.equal(await size.count(), 0);
      await save.click();
      await page.getByRole("alertdialog").waitFor();
      assert.equal(writes.length, 1);
      assert.equal(writes[0].jetStream.newStreamMaxBytes, supportsCapacity ? 34_078_720 : undefined);
      assert.equal(writes[0].outboxEnabled, true);
      assert.equal(writes[0].revision, settings.revision);
    } finally { await browser.close(); }
  });
}

test("dead letters stay readable when queue settings fail and repeat searches refresh without offering unauthorized replay", { timeout: 25_000 }, async () => {
  let letterReads = 0;
  const browser = await fixture.page(({ path }) => {
    if (path === "/api/v1/auth/me") return { data: { id: "fixture", username: "Fixture reader", email: "reader@example.invalid", roleCodes: [], permissionVersion: 1, rbacVersion: 1, permissionRules: ["admin.access", "admin.config.read"].map(code => ({ code, allow: true, priority: 100 })) } };
    if (path === "/api/v1/admin/config/nats") return { status: 503, error: "Synthetic configuration outage" };
    if (path === "/api/v1/admin/infrastructure/dead-letters") return { data: { items: [{ id: 99, eventType: "fixture", eventId: `event-${++letterReads}`, lastError: "Stopped", failedAt: "2026-10-01T10:00:00Z", status: "unresolved", attempts: 1 }], limit: 50, hasMore: false, nextCursor: "" } };
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="infrastructure"]').click();
    await page.locator('[data-admin-panel="nats"]').click();
    await page.getByRole("main").getByRole("alert").getByText("Unable to load. Please try again.", { exact: true }).waitFor();
    await page.getByText("fixture / event-1", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Replay", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText("fixture / event-2", { exact: true }).waitFor();
    assert.equal(letterReads, 2);
  } finally { await browser.close(); }
});

test("NATS configuration conflicts retain drafts and require a fresh credential decision", { timeout: 30_000 }, async () => {
  const initial = {
    revision: "a".repeat(64), enabled: false, url: "nats://old.example.invalid:4222", username: "worker",
    hasPassword: true, hasToken: true, subjectPrefix: "previous", tasks: [], outboxEnabled: true, realtime: false,
    jetStream: { enabled: false, stream: "MCMODS_TASKS", maxDeliver: 8, ackWaitSeconds: 300, publishTimeoutSeconds: 5 },
    status: { enabled: false, connected: false, jetStream: false, url: "", subjectPrefix: "previous", tasks: [] },
  };
  const latest = { ...initial, revision: "b".repeat(64), subjectPrefix: "new-prefix" };
  const writes: Array<Record<string, unknown>> = [];
  let reads = 0;
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/infrastructure/dead-letters") return { data: { items: [], hasMore: false, nextCursor: "", limit: 50 } };
    if (path === "/api/v1/admin/config/nats") {
      if (method === "GET") return { data: ++reads === 1 ? initial : latest };
      const write = JSON.parse(body) as typeof writes[number];
      writes.push(write);
      if (writes.length === 1) return { status: 400, code: "NATS_CREDENTIAL_DECISION_REQUIRED", error: "Choose credentials" };
      if (writes.length === 2) return { status: 409, code: "NATS_CONFIG_CONFLICT", error: "Changed" };
      return { data: { ...latest, url: write.url, hasPassword: true, hasToken: false, revision: "c".repeat(64) } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/admin");
    await page.locator('[data-admin-group="infrastructure"]').click();
    await page.locator('[data-admin-panel="nats"]').click();
    const save = page.getByRole("button", { name: "Save NATS settings", exact: true });
    const url = page.getByRole("textbox", { name: "Server URL", exact: true });
    const password = page.getByLabel("Password", { exact: true });
    const clearToken = page.getByRole("checkbox", { name: "Clear the saved token", exact: true });
    await url.fill("nats://next.example.invalid:4222");
    await save.click();
    await page.getByText("The connection target or account changed.", { exact: false }).waitFor();
    assert.equal(await url.inputValue(), "nats://next.example.invalid:4222");
    await password.fill("fixture-first");
    await clearToken.check();
    await save.click();
    const compare = page.getByRole("button", { name: "Compare with the latest settings", exact: true });
    await compare.waitFor();
    assert.equal(await save.isDisabled(), true);
    assert.equal(await password.inputValue(), "fixture-first");
    await compare.click();
    await page.getByRole("button", { name: "Apply my edited fields to the latest settings", exact: true }).click();
    assert.equal(await password.inputValue(), "");
    assert.equal(await clearToken.isChecked(), false);
    assert.equal(await url.inputValue(), "nats://next.example.invalid:4222");
    await password.fill("fixture-reconfirmed");
    await clearToken.check();
    await save.click();
    await page.getByRole("alertdialog").waitFor();
    assert.equal(reads, 2);
    assert.deepEqual(writes.map(write => write.revision), [initial.revision, initial.revision, latest.revision]);
    assert.equal(writes[2].subjectPrefix, latest.subjectPrefix);
    assert.equal(writes[2].password, "fixture-reconfirmed");
    assert.equal(writes[2].clearToken, true);
    assert.equal(await password.inputValue(), "");
  } finally { await browser.close(); }
});

test("log category retention inherits the live global period until set explicitly", { timeout: 20_000 }, async () => {
  const config = { enabled: true, defaultDays: 45, categoryDays: { download: 0, api_access: 120 } };
  const writes: Array<typeof config> = [];
  let cleans = 0;
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/logs/config") {
      if (method === "GET") return { data: config };
      const next = JSON.parse(body) as typeof config; writes.push(next); return { data: { config: next } };
    }
    if (path === "/api/v1/admin/logs/cleanup") { cleans++; return { data: { config, deleted: {} } }; }
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/admin");
    await page.locator('[data-admin-group="logs"]').click();
    await page.locator('[data-admin-panel="logs-cleanup"]').click();
    const globalDays = page.getByRole("spinbutton", { name: "Default retention days" });
    const download = page.getByRole("spinbutton", { name: /download/i });
    const api = page.getByRole("spinbutton", { name: "API access logs", exact: true });
    await download.waitFor();
    assert.equal(await download.inputValue(), "");
    assert.equal(await download.getAttribute("placeholder"), "45");
    assert.equal(await api.inputValue(), "120");
    await globalDays.fill("0");
    const save = page.getByRole("button", { name: "Save", exact: true });
    assert.equal(await save.isDisabled(), true);
    await globalDays.fill("15");
    assert.equal(await download.getAttribute("placeholder"), "15");
    await api.fill("");
    await download.fill("30");
    await save.click();
    await page.getByText("Log cleanup policy saved.", { exact: true }).waitFor();
    assert.deepEqual(writes, [{ enabled: true, defaultDays: 15, categoryDays: { download: 30, api_access: 0 } }]);
    assert.equal(await api.getAttribute("placeholder"), "15");
    assert.equal(await api.inputValue(), "");
    assert.equal(cleans, 0);
  } finally { await browser.close(); }
});

test("an unversioned NATS read or committed receipt cannot enable another save", { timeout: 25_000 }, async () => {
  const initial = {
    enabled: false, url: "nats://queue.example.invalid:4222", username: "", hasPassword: false, hasToken: false, subjectPrefix: "scope", tasks: [], outboxEnabled: true, realtime: false,
    jetStream: { enabled: false, stream: "QUEUE", maxDeliver: 8, ackWaitSeconds: 300, publishTimeoutSeconds: 5 },
    status: { enabled: false, connected: false, jetStream: false, url: "", subjectPrefix: "scope", tasks: [] },
  };
  let reads = 0;
  const writes: string[] = [];
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/infrastructure/dead-letters") return { data: { items: [], hasMore: false, nextCursor: "", limit: 50 } };
    if (path === "/api/v1/admin/config/nats") {
      if (method === "GET") return { data: ++reads === 1 ? initial : { ...initial, revision: String(reads).repeat(64) } };
      writes.push(JSON.parse(body).revision);
      if (writes.length === 1) return { status: 428, error: "Read expected", code: "NATS_CONFIG_REVISION_REQUIRED" };
      return { status: 204 };
    }
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/admin");
    await page.locator('[data-admin-group="infrastructure"]').click();
    await page.locator('[data-admin-panel="nats"]').click();
    const save = page.getByRole("button", { name: "Save NATS settings", exact: true });
    const compare = page.getByRole("button", { name: "Compare with the latest settings", exact: true });
    const discard = page.getByRole("button", { name: "Discard my draft and use the latest settings", exact: true });
    await compare.waitFor();
    assert.equal(await save.isDisabled(), true);
    await compare.click(); await discard.click(); await save.click();
    await page.getByText("The configuration changed. Your draft is preserved.", { exact: true }).waitFor();
    assert.equal(await save.isDisabled(), true);
    await compare.click(); await discard.click(); await save.click();
    await compare.waitFor();
    assert.equal(await save.isDisabled(), true);
    assert.deepEqual(writes, ["2".repeat(64), "3".repeat(64)]);
  } finally { await browser.close(); }
});
