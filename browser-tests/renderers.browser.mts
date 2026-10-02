import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

// The real production Canvas and page render here. Only the explicit API
// boundary is substituted; this verifies browser recovery, not persistence.
test("unavailable WebGL keeps the real blueprint page readable in both UI languages", { timeout: 30_000 }, async () => {
  for (const [locale, failure] of [
    ["en-US", "The 3D preview could not be rendered."],
    ["zh-CN", "无法渲染三维预览。"],
  ]) {
    let renderRequests = 0;
    const browser = await fixture.page(({ path }) => {
      if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
      if (path === "/api/v1/stickers") return { data: { packs: [] } };
      if (path === "/api/v1/auth/me") return { status: 401, code: "AUTH_UNAUTHENTICATED", error: "Guest test session" };
      if (path === "/api/v1/blueprints/audit-webgl") return { data: {
        id: "audit-webgl", title: "Audited blueprint", description: "", sourceFormat: "nbt", status: "ready",
        size: [1, 1, 1], blockCount: 1, paletteCount: 1, entityCount: 0, dataVersion: 1, lastError: "",
        createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
        uploader: { id: "synthetic-author", username: "Synthetic author" }, requiredMods: [],
        variants: [], materials: [], assetRevisions: [], canEdit: false, renderAvailable: true,
      } };
      if (path === "/api/v1/content/audit-webgl") return { status: 404, error: "No localized content fixture" };
      if (path === "/api/v1/blueprints/audit-webgl/render") { renderRequests++; return { bytes: new TextEncoder().encode(JSON.stringify({ size: [1, 1, 1], blocks: [] })), contentType: "application/json" }; }
      if (path === "/api/v1/comment-targets/blueprint/audit-webgl/comments") return { data: { items: [], total: 0, nextCursor: "", capabilities: { canCreate: false } } };
      if (path === "/api/v1/projects/audit-webgl/follow") return { data: { followed: false, notificationsEnabled: false } };
    });
    try {
      await browser.page.context().addCookies([{ name: "mcmods-ui-locale", value: locale, url: fixture.origin }]);
      await browser.page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value(...args: Parameters<typeof original>) {
          if (String(args[0]).startsWith("webgl")) return null;
          return Reflect.apply(original, this, args);
        } });
      });
      await browser.page.setViewportSize({ width: 390, height: 844 });
      await browser.page.goto(`${fixture.origin}/blueprints/audit-webgl`);
      await browser.page.getByRole("heading", { name: "Audited blueprint", exact: true }).waitFor();
      await browser.page.getByRole("alert").getByText(failure, { exact: true }).waitFor();
      assert.equal(await browser.page.locator("html").getAttribute("lang"), locale);
      assert.equal(await browser.page.locator("html").getAttribute("dir"), "ltr");
      assert.equal(renderRequests, 1);
    } finally { await browser.close(); }
  }
});
