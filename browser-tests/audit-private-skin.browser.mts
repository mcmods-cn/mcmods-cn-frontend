import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import sharp from "sharp";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

test("CMP-001 private API texture cookies reach real 3D/2D image decoders", { timeout: 30_000 }, async () => {
  const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#4b8ad9" } }).png().toBuffer();
  const hash = "a".repeat(64);
  const texturePath = `/api/yggdrasil/textures/${hash}`;
  const cookieModes: string[] = [];
  const handler: APIHandler = ({ path, headers }) => {
    if (path === texturePath) {
      cookieModes.push(headers.cookie || "");
      return headers.cookie?.includes("mcmods_session=synthetic-private-owner") ? { bytes: png, contentType: "image/png", headers: { "cache-control": "private, no-cache" } } : { status: 404, error: "Private texture unavailable" };
    }
    if (path === "/api/v1/auth/me") return { data: { id: "skinowner1", username: "Private owner", roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 } };
    if (path === "/api/v1/skins/private01") return { data: { publicId: "private01", kind: "skin", model: "default", name: "Private test skin", description: "Synthetic private texture", tags: [], visibility: "private", reviewStatus: "approved", textureHash: hash, owner: { id: "skinowner1", username: "Private owner" }, downloads: 0, createdAt: "2026-10-24T00:00:00Z", canEdit: true, canUse: true, inWardrobe: false } };
    if (path === "/api/v1/skins/private01/content") return { status: 404, error: "Synthetic translation absent" };
    if (path === "/api/v1/users/me/player-profiles") return { data: { items: [] } };
    if (path === "/api/v1/projects/private01/follow") return { data: { followed: false, notificationsEnabled: false } };
    if (path === "/api/v1/comment-targets/skin/private01/comments") return { data: { items: [], total: 0, capabilities: { canCreate: false }, nextCursor: "" } };
  };
  const browser = await fixture.page(handler);
  try {
    const { page } = browser;
    await page.context().addCookies([{ name: "mcmods_session", value: "synthetic-private-owner", url: "https://api.example.test", httpOnly: true, sameSite: "None", secure: true }]);
    await page.addInitScript(({ texturePath }) => {
      const observed: string[] = [];
      Reflect.set(window, "mcmodsObservedTextureModes", observed);
      const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
      Object.defineProperty(HTMLImageElement.prototype, "src", { ...original, set(value: string) { if (String(value).includes(texturePath)) observed.push(this.crossOrigin); original.set!.call(this, value); } });
    }, { texturePath });
    await page.goto(`${fixture.origin}/skins/private01`);
    await page.getByRole("heading", { name: "Private test skin", exact: true }).waitFor();
    await page.waitForFunction(() => Boolean(document.querySelector("canvas[data-engine]")));
    assert(cookieModes.some(value => value.includes("synthetic-private-owner")), "The protected request must authenticate before Three can build the real renderer");
    await page.getByRole("button", { name: "2D preview", exact: true }).click();
    const canvas = page.getByRole("img", { name: "Private test skin", exact: true });
    await canvas.waitFor();
    await page.waitForFunction(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[aria-label="Private test skin"]');
      if (!canvas || canvas.classList.contains("invisible")) return false;
      const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
      return Boolean(data?.some((value, index) => index % 4 === 3 && value > 0));
    });
    const modes = await page.evaluate(() => Reflect.get(window, "mcmodsObservedTextureModes") as string[]);
    assert(modes.length >= 2, "Both production image loaders must set a request mode even if the native image cache reuses bytes");
    assert(modes.every(value => value === "use-credentials"));
    assert(cookieModes.length >= 1, "At least one actual protected-byte HTTP request must occur");
    assert(cookieModes.every(value => value.includes("mcmods_session=synthetic-private-owner")));
  } finally { await browser.close(); }
});
