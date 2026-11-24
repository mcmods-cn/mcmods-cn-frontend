import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, type APIHandler } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });
const currency = { publicId: "currency1", code: "audit", name: "Audit", icon: "", description: "Synthetic test currency", translations: {}, transferTaxBps: 0, status: "active", displayOrder: 0 };
const common: APIHandler = ({ path }) => {
  if (path === "/api/v1/auth/me") return { data: { id: "sender001", username: "Ordinary sender", roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 } };
  if (path === "/api/v1/users/me/economy") return { data: { balances: [{ ...currency, balance: 100 }], experience: 0, level: 1, timezone: "UTC", checkin: { enabled: false, currency: "audit", amount: 0, checkedInToday: false }, inventory: [] } };
  if (path === "/api/v1/economy/currencies") return { data: { items: [currency] } };
  if (path === "/api/v1/shop/items" || path === "/api/v1/users/me/tasks") return { data: { items: [] } };
  if (path === "/api/v1/users/me/economy/transactions" || path === "/api/v1/users/me/experience/transactions") return { data: { items: [], nextCursor: "" } };
  if (path === "/api/v1/users/me/notification-settings") return { data: { emailEnabled: false, projectUpdatesEnabled: true } };
  if (path === "/api/v1/users/me/profile-settings") return { data: { publicId: "sender001", username: "Ordinary sender", signature: "", signatureMaxBytes: 100, avatarUrl: "", profileBackgroundUrl: "", timezone: "UTC", messageReceive: true, showOnlineStatus: false, onlineStatus: "offline", publicCardStatSlots: [], cardStatisticOptions: [], canUpdateAvatar: false, canUseAnimatedAvatar: false } };
  if (path === "/api/v1/users/me/overview") return { data: { followers: 0, following: 0, blocked: 0, aiBalance: { balance: 0, held: 0, available: 0 } } };
};

for (const recipientPublicId of ["000012345", "9007199254740993"]) test(`FID-001 explicit public ID preserves string ${recipientPublicId} and sends only its named field`, { timeout: 30_000 }, async () => {
  const requests: unknown[] = [];
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/users/me/economy/transfer" && request.method === "POST") { requests.push(JSON.parse(request.body)); return { data: { received: 1, tax: 0 } }; }
    return common(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user?section=economy`);
    await page.getByLabel("Recipient identifier", { exact: true }).selectOption("public_id");
    await page.getByLabel("Recipient", { exact: true }).fill(recipientPublicId);
    await page.getByRole("button", { name: "Confirm transfer", exact: true }).click();
    await page.getByText("Transfer complete. The recipient received 1; tax: 0.", { exact: true }).waitFor();
    assert.deepEqual(requests, [{ recipientPublicId, currency: "audit", amount: 1 }]);
  } finally { await browser.close(); }
});

test("FID-001 ambiguous text keeps its input and interpretation until the user explicitly chooses public ID", { timeout: 30_000 }, async () => {
  const requests: Record<string, unknown>[] = [];
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/users/me/economy/transfer" && request.method === "POST") {
      const body = JSON.parse(request.body);
      requests.push(body);
      return body.recipientPublicId ? { data: { received: 1, tax: 0 } } : { status: 409, code: "TRANSFER_RECIPIENT_AMBIGUOUS", error: "Synthetic collision requires explicit identity" };
    }
    return common(request);
  });
  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/user?section=economy`);
    const mode = page.getByLabel("Recipient identifier", { exact: true });
    const recipient = page.getByLabel("Recipient", { exact: true });
    await mode.waitFor();
    assert.equal(await mode.inputValue(), "identifier", "Existing text mode must retain its interpretation");
    await recipient.fill("000012345");
    await page.getByRole("button", { name: "Confirm transfer", exact: true }).click();
    await page.getByText("More than one account matches. Choose Public user ID and enter the ID shown on the recipient’s profile.", { exact: true }).waitFor();
    assert.equal(await mode.inputValue(), "identifier");
    assert.equal(await recipient.inputValue(), "000012345");
    assert.deepEqual(requests, [{ recipient: "000012345", currency: "audit", amount: 1 }]);
    await page.getByRole("alertdialog").getByRole("button", { name: "Close", exact: true }).click();
    await mode.selectOption("public_id");
    assert.equal(requests.length, 1, "Changing interpretation must not replay a transfer");
    await page.getByRole("button", { name: "Confirm transfer", exact: true }).click();
    await page.getByText("Transfer complete. The recipient received 1; tax: 0.", { exact: true }).waitFor();
    assert.deepEqual(requests[1], { recipientPublicId: "000012345", currency: "audit", amount: 1 });
  } finally { await browser.close(); }
});

test("FID-001 username or email keeps the existing explicitly named text contract", { timeout: 30_000 }, async () => {
  const requests: unknown[] = [];
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/users/me/economy/transfer" && request.method === "POST") { requests.push(JSON.parse(request.body)); return { data: { received: 1, tax: 0 } }; }
    return common(request);
  });
  try {
    await browser.page.goto(`${fixture.origin}/user?section=economy`);
    await browser.page.getByLabel("Recipient", { exact: true }).fill("ordinary@example.invalid");
    await browser.page.getByRole("button", { name: "Confirm transfer", exact: true }).click();
    await browser.page.getByText("Transfer complete. The recipient received 1; tax: 0.", { exact: true }).waitFor();
    assert.deepEqual(requests, [{ recipient: "ordinary@example.invalid", currency: "audit", amount: 1 }]);
  } finally { await browser.close(); }
});

test("a failed ledger leaves available balances intact and retries only that read before a single transfer", { timeout: 30_000 }, async () => {
  let ledgerReads = 0, balanceReads = 0, transfers = 0;
  const submitted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const browser = await fixture.page(async request => {
    if (request.path === "/api/v1/users/me/economy") balanceReads++;
    if (request.path === "/api/v1/users/me/economy/transactions" && ++ledgerReads === 1) return { status: 503, error: "Ledger temporarily unavailable" };
    if (request.path === "/api/v1/users/me/economy/transfer" && request.method === "POST") {
      transfers++; submitted.resolve(); await release.promise;
      return { data: { received: 1, tax: 0 } };
    }
    return common(request);
  });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/user?section=economy");
    const error = page.getByRole("alert").filter({ hasText: "Failed to load economy and progression data." });
    await error.waitFor();
    await page.getByText("100", { exact: true }).waitFor();
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await error.waitFor({ state: "detached" });
    assert.equal(balanceReads, 1); assert.equal(ledgerReads, 2);
    await page.getByLabel("Recipient", { exact: true }).fill("ordinary@example.invalid");
    const submit = page.getByRole("button", { name: "Confirm transfer", exact: true });
    await submit.evaluate((button: HTMLButtonElement) => { button.form!.requestSubmit(); button.form!.requestSubmit(); });
    await submitted.promise;
    assert.equal(await submit.isDisabled(), true);
    release.resolve();
    await page.getByText("Transfer complete. The recipient received 1; tax: 0.", { exact: true }).waitFor();
    assert.equal(transfers, 1);
  } finally { release.resolve(); await browser.close(); }
});
