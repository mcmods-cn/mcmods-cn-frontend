import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler, type APIReply } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());
const stamp = "2026-01-02T00:00:00Z";
const common: APIHandler = ({ path }) => {
  if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
  if (path === "/api/v1/stickers") return { data: { packs: [] } };
  if (path === "/api/v1/markdown/config") return { data: {} };
};
const controlled = (handler: APIHandler) => fixture.page(async request => await handler(request) ?? common(request));
declare global {
  interface Window { __oct03Images: { releaseOld?: () => void; started: boolean; closed: string[]; created: string[]; revoked: string[] } }
}

// Browser PNG decoding is native. Only decoding completion order and the OSS
// HTTP ticket/metadata responses are controlled; no real file-store write runs.
test("FP030 FP031 skin ignores a late decoded file, releases bitmap/URL resources and retries metadata with its uploaded ID", { timeout: 30_000 }, async () => {
  let uploads = 0;
  const writes: Array<Record<string, unknown>> = [];
  const second = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/users/me/oss/uploads/presign") {
      uploads++;
      assert.equal(JSON.parse(body).originalName, "new.png");
      return { data: { uploadRequired: false, file: { id: "skin-file-01", originalName: "new.png", contentType: "image/png", sizeBytes: 100 } } };
    }
    if (path === "/api/v1/skins") {
      if (method === "GET") return { data: { items: [], hasMore: false, nextCursor: "" } };
      writes.push(JSON.parse(body));
      if (writes.length === 1) return { status: 503, error: "Controlled skin metadata failure" };
      started.resolve(); return second.promise;
    }
  });
  try {
    const { page } = browser;
    await page.addInitScript(() => {
      window.__oct03Images = { started: false, closed: [], created: [], revoked: [] };
      window.createImageBitmap = new Proxy(window.createImageBitmap, { apply(target, thisArg, args: unknown[]) {
        const nativeResult = Reflect.apply(target, thisArg, args) as Promise<ImageBitmap>;
        return nativeResult.then(bitmap => {
          const name = args[0] instanceof File ? args[0].name : "other";
          const close = bitmap.close.bind(bitmap);
          bitmap.close = () => { window.__oct03Images.closed.push(name); close(); };
          if (name !== "old.png") return bitmap;
          window.__oct03Images.started = true;
          return new Promise<ImageBitmap>(resolve => { window.__oct03Images.releaseOld = () => resolve(bitmap); });
        });
      } });
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = object => { const url = create(object); window.__oct03Images.created.push(url); return url; };
      URL.revokeObjectURL = url => { window.__oct03Images.revoked.push(url); revoke(url); };
    });
    await page.goto(`${fixture.origin}/skins/upload`);
    const png = async (width: number, height: number) => Buffer.from(await page.evaluate(({ width, height }) => {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      return canvas.toDataURL("image/png").split(",")[1];
    }, { width, height }), "base64");
    const fileInput = page.locator('input[accept="image/png,.png"]');
    await fileInput.setInputFiles({ name: "old.png", mimeType: "image/png", buffer: await png(64, 64) });
    await page.waitForFunction(() => window.__oct03Images.started);
    await fileInput.setInputFiles({ name: "new.png", mimeType: "image/png", buffer: await png(128, 64) });
    await page.getByText("128 × 64", { exact: true }).waitFor();
    await page.evaluate(() => window.__oct03Images.releaseOld?.());
    await page.waitForFunction(() => window.__oct03Images.closed.includes("old.png"));
    assert.equal(await page.getByText("128 × 64", { exact: true }).count(), 1);
    assert.equal(await page.getByText("64 × 64", { exact: true }).count(), 0);
    const name = page.getByRole("textbox", { name: "Name (en-US)", exact: true });
    assert.equal(await name.inputValue(), "new");
    await name.fill("Preserved skin metadata");
    await page.getByRole("button", { name: "Submit texture", exact: true }).click();
    await page.getByRole("alertdialog").filter({ hasText: "Controlled skin metadata failure" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await name.inputValue(), "Preserved skin metadata");
    await page.getByRole("button", { name: "Submit texture", exact: true }).click();
    await started.promise;
    assert.equal(await name.isDisabled(), true);
    assert.equal(await fileInput.isDisabled(), true);
    assert.equal(uploads, 1);
    assert.equal(writes.length, 2);
    assert.deepEqual(writes.map(item => item.fileId), ["skin-file-01", "skin-file-01"]);
    second.resolve({ status: 503, error: "Controlled retry metadata failure" });
    await page.getByRole("alertdialog").filter({ hasText: "Controlled retry metadata failure" }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator('main a[href="/skins"]').click();
    await page.waitForURL(url => url.pathname === "/skins");
    await page.waitForFunction(() => window.__oct03Images.created.every(url => window.__oct03Images.revoked.includes(url)));
    assert(await page.evaluate(() => window.__oct03Images.closed.filter(name => name === "new.png").length >= 3));
  } finally { second.resolve({ status: 503, error: "Controlled retry metadata failure" }); await browser.close(); }
});

test("FP030 blueprint metadata retries preserve the original upload and prevent concurrent submissions", { timeout: 30_000 }, async () => {
  let uploads = 0;
  const writes: Array<Record<string, unknown>> = [];
  const held = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const browser = await controlled(({ path, method, body }) => {
    if (path === "/api/v1/users/me/oss/uploads/presign") {
      uploads++;
      return { data: { uploadRequired: false, file: { id: "blueprint-file01", blueprintId: "blueprint01", originalName: "synthetic.nbt", contentType: "application/octet-stream", sizeBytes: 4 } } };
    }
    if (path === "/api/v1/blueprints/blueprint01" && method === "PUT") {
      writes.push(JSON.parse(body));
      if (writes.length === 1) return { status: 503, error: "Controlled blueprint metadata failure" };
      started.resolve(); return held.promise;
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/blueprints/upload`);
    await page.locator('input.sr-only[accept=".nbt,.schem,.schematic,.litematic"]').setInputFiles({ name: "synthetic.nbt", mimeType: "application/octet-stream", buffer: Buffer.from("NBT!") });
    const name = page.locator('input[maxlength="120"]');
    await name.fill("Preserved blueprint metadata");
    const upload = page.locator("fieldset button.button-primary").last();
    await upload.click();
    await page.getByRole("alertdialog").filter({ hasText: "Controlled blueprint metadata failure" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await name.inputValue(), "Preserved blueprint metadata");
    await upload.evaluate(node => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
    await started.promise;
    assert.equal(await name.isDisabled(), true);
    assert.equal(uploads, 1);
    assert.equal(writes.length, 2);
    assert(writes.every(item => item.title === "Preserved blueprint metadata"));
    held.resolve({ status: 503, error: "Controlled blueprint retry metadata failure" });
    await page.getByRole("alertdialog").filter({ hasText: "Controlled blueprint retry metadata failure" }).waitFor();
    assert.equal(await name.inputValue(), "Preserved blueprint metadata");
  } finally { held.resolve({ status: 503, error: "Controlled blueprint retry metadata failure" }); await browser.close(); }
});

test("FP029 blueprint polling waits for the previous read and stops when processing completes", { timeout: 30_000 }, async () => {
  let reads = 0;
  let failed = true;
  const held = Promise.withResolvers<APIReply>();
  const started = Promise.withResolvers<void>();
  const record = (status: string) => ({ id: "blueprint01", title: "Polling blueprint", description: "", sourceFormat: "nbt", status, size: [1, 1, 1], blockCount: 1, paletteCount: 1, createdAt: stamp, updatedAt: stamp, uploader: { id: "owner0001", username: "Synthetic uploader" }, requiredMods: [], entityCount: 0, dataVersion: 1, lastError: "", canEdit: false, renderAvailable: false, variants: [], materials: [], assetRevisions: [] });
  const browser = await controlled(({ path }) => {
    if (path === "/api/v1/blueprints/blueprint01") {
      reads++;
      if (failed) return { status: 503, error: "Controlled blueprint read failure" };
      if (reads === 3) { started.resolve(); return held.promise; }
      return { data: record("processing") };
    }
    if (path === "/api/v1/content/blueprint01") return { data: { defaultLocale: "en-US", available: [], translation: { status: "missing" } } };
    if (path === "/api/v1/users/me/favorites/summary") return { data: { entityPublicIds: [], collectionIdsByEntity: {} } };
    if (path === "/api/v1/projects/blueprint01/follow") return { data: { followed: false, notificationsEnabled: true } };
    if (path === "/api/v1/comment-targets/blueprint/blueprint01/comments") return { data: { items: [], total: 0, capabilities: { canCreate: false } } };
  });
  try {
    const { page } = browser;
    await page.clock.install();
    await page.goto(`${fixture.origin}/blueprints/blueprint01`);
    await page.getByText("Controlled blueprint read failure", { exact: true }).waitFor();
    failed = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("heading", { name: "Polling blueprint", exact: true }).waitFor();
    await page.clock.runFor(3001);
    await started.promise;
    await page.clock.runFor(6000);
    assert.equal(reads, 3, "polling intervals must not overlap an unresolved read");
    held.resolve({ data: record("ready") });
    await page.getByText("Ready", { exact: true }).waitFor();
    await page.clock.runFor(9000);
    assert.equal(reads, 3, "a ready blueprint has no processing poll timer");
  } finally { held.resolve({ data: record("ready") }); await browser.close(); }
});
