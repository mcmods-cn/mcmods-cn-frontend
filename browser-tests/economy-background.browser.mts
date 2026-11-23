import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

test("a confirmed background use updates inventory and retries only the failed preview read", { timeout: 30_000 }, async () => {
  const itemCode = "background";
  const itemPublicId = "ownedbg01";
  const fileId = "newback01";
  const backgroundURL = "https://assets.example.test/new-background.png";
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/xksAAAAASUVORK5CYII=", "base64");
  const writes: unknown[] = [];
  let presigns = 0;
  let profileReads = 0;
  let failedPreviewRead = false;
  let balance = 1;
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/new-background.png") return { bytes: png, contentType: "image/png" };
    if (path === "/api/v1/auth/me") return { data: { id: "owner0001", username: "Background owner", roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 } };
    if (path === "/api/v1/users/me/notification-settings") return { data: { emailEnabled: false, projectUpdatesEnabled: true } };
    if (path === "/api/v1/users/me/overview") return { data: { followers: 0, following: 0, blocked: 0, aiBalance: null } };
    if (path === "/api/v1/users/me/profile-settings") {
      profileReads++;
      if (writes.length && !failedPreviewRead) {
        failedPreviewRead = true;
        return { status: 503, error: "Synthetic profile read temporarily unavailable" };
      }
      return { data: { publicId: "owner0001", username: "Background owner", signature: "", signatureMaxBytes: 100,
        avatarUrl: "", profileBackgroundUrl: writes.length ? backgroundURL : "", timezone: "UTC", messageReceive: true,
        showOnlineStatus: false, onlineStatus: "offline", publicCardStatSlots: [], cardStatisticOptions: [], canUpdateAvatar: false, canUseAnimatedAvatar: false } };
    }
    if (path === "/api/v1/users/me/economy") return { data: { balances: [], level: 1, experience: 0, timezone: "UTC", checkin: { enabled: false, checkedInToday: false }, inventory: [] } };
    if (path === "/api/v1/shop/items") return { data: { items: [{ publicId: itemPublicId, code: itemCode,
      name: "Synthetic profile background", description: "A display asset", priceAmount: 2, priceCurrency: "gold",
      itemType: "profile_background", inventoryQuantity: balance, canPurchase: false, canUse: true, icon: "", translations: {} }] } };
    if (path === "/api/v1/economy/currencies" || path === "/api/v1/users/me/tasks") return { data: { items: [] } };
    if (path === "/api/v1/users/me/economy/transactions" || path === "/api/v1/users/me/experience/transactions") return { data: { items: [], nextCursor: "" } };
    if (path === "/api/v1/users/me/oss/uploads/presign" && method === "POST") {
      presigns++;
      const request = JSON.parse(body);
      assert.equal(request.source, "profile_background");
      return { data: { uploadRequired: false, file: { id: fileId, originalName: request.originalName,
        sizeBytes: request.sizeBytes, sourceSizeBytes: request.sizeBytes, status: "active", scanStatus: "clean" } } };
    }
    if (path === "/api/v1/users/me/shop/use" && method === "POST") {
      writes.push(JSON.parse(body));
      if (!balance) return { status: 409, error: "No item available" };
      balance--;
      return { data: { itemCode, itemPublicId, remaining: balance } };
    }
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user?section=economy`);
    const item = page.locator(`#economy-shop_item-${itemPublicId}`);
    await item.getByText("Owned: 1", { exact: true }).waitFor();
    await page.getByText("ID owner0001", { exact: true }).waitFor();
    await item.locator("input[type=file]").setInputFiles({ name: "background.png", mimeType: "image/png", buffer: png });
    await page.getByRole("alertdialog").waitFor();
    assert.match(await page.getByRole("alertdialog").innerText(), /Profile background updated\./);
    await item.getByText("Owned: 0", { exact: true }).waitFor();
    assert.equal(await item.locator("input[type=file]").count(), 0);
    await page.getByRole("alertdialog").getByRole("button", { name: "Close", exact: true }).click();
    const previewError = page.getByRole("alert").filter({ hasText: "Your background was saved. Reload the preview to see it." });
    const retry = previewError.getByRole("button", { name: "Retry", exact: true });
    await retry.focus();
    await retry.press("Enter");
    await previewError.waitFor({ state: "hidden" });
    await page.waitForFunction((url) => [...document.querySelectorAll<HTMLElement>("[style]")].some((node) => node.style.backgroundImage.includes(url)), backgroundURL);
    assert.deepEqual(writes, [{ itemCode, fileId }]);
    assert.equal(presigns, 1);
    assert.equal(profileReads, 3);
  } finally { await browser.close(); }
});
