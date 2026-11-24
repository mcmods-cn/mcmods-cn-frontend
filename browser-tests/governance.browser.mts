import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture, navigateAdminPanel } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

test("TEST048 real report panel claims, rejects a failed resolution and then commits once", { timeout: 30_000 }, async () => {
  let claimed = false;
  let resolved = false;
  let resolutions = 0;
  const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/reports") return { data: { items: resolved ? [] : [{ id: "report048", targetType: "user", targetId: "target048", reporterName: "Reporter", reasonCode: "harassment", status: claimed ? "in_review" : "pending", createdAt: "2026-09-30T12:00:00Z" }], limit: 50, hasMore: false, nextCursor: "" } };
    if (path === "/api/v1/admin/reports/report048") return { data: { id: "report048", targetType: "user", targetId: "target048", detail: "TEST048 selected immutable report", status: claimed ? "in_review" : "pending", reasonCode: "harassment", claimedByCurrentUser: claimed, canTakeover: false, evidence: [], reviews: [], actions: [], relatedReports: [] } };
    if (method === "POST" && path.endsWith("/claim")) {
      mutations.push({ path, body: JSON.parse(body) });
      claimed = true;
      return { data: { status: "in_review" } };
    }
    if (method === "POST" && path.endsWith("/resolve")) {
      mutations.push({ path, body: JSON.parse(body) });
      resolutions += 1;
      if (resolutions === 1) return { status: 409, error: "TEST048 ownership changed; reload report" };
      resolved = true;
      return { data: { status: "resolved_invalid" } };
    }
  });
  try {
    const { page } = browser;
    await navigateAdminPanel(page, fixture.origin, "Report review");
    await page.getByRole("button", { name: /user · harassment/ }).click();
    await page.getByRole("button", { name: "Claim report", exact: true }).click();
    await page.locator('select[name="conclusion"]').selectOption("invalid");
    await page.locator('textarea[name="note"]').fill("Test invalid report");
    await page.getByRole("button", { name: "Submit decision", exact: true }).click();
    await page.getByText("TEST048 ownership changed; reload report", { exact: true }).waitFor();
    assert.equal(await page.locator('textarea[name="note"]').inputValue(), "Test invalid report", "failed mutation must preserve editable data");
    await page.getByRole("button", { name: "Submit decision", exact: true }).click();
    await page.getByText("Select a report to inspect its snapshot, evidence, and actions.", { exact: true }).waitFor();
    assert.equal(mutations.filter(item => item.path.endsWith("/claim")).length, 1);
    assert.equal(resolutions, 2);
    for (const item of mutations.filter(item => item.path.endsWith("/resolve"))) {
      assert.equal(item.body.conclusion, "invalid");
      assert.equal(item.body.deleteTarget, false);
      assert.equal(item.body.banUserId, "");
      assert.match(String(item.body.idempotencyKey), /^[a-f0-9-]{36}$/);
    }
  } finally { await browser.close(); }
});

test("TEST048 real ban form survives deferred submit, preserves failures and sends RFC3339", { timeout: 30_000 }, async () => {
  let submitted = 0;
  const bodies: Array<Record<string, unknown>> = [];
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/bans" && method === "GET") return { data: { items: [], limit: 30, hasMore: false, nextCursor: "" } };
    if (path === "/api/v1/admin/bans" && method === "POST") {
      bodies.push(JSON.parse(body));
      submitted += 1;
      if (submitted === 1) return { status: 400, error: "TEST048 rejected: user already banned" };
      return { data: { created: true } };
    }
  });
  try {
    const { page } = browser;
    await navigateAdminPanel(page, fixture.origin, "User bans and Blackroom");
    await page.locator('input[name="userId"]').fill("target048");
    await page.locator('select[name="reasonCode"]').selectOption("harassment");
    await page.locator('input[name="endsAt"]').fill("2099-10-01T14:35");
    await page.locator('textarea[name="internalNote"]').fill("Test confidential reason");
    await page.getByRole("button", { name: "Create ban", exact: true }).click();
    await page.getByText("TEST048 rejected: user already banned", { exact: true }).waitFor();
    assert.equal(await page.locator('input[name="userId"]').inputValue(), "target048");
    await page.getByRole("button", { name: "Create ban", exact: true }).click();
    await page.waitForFunction(() => (document.querySelector('input[name="userId"]') as HTMLInputElement | null)?.value === "");
    assert.equal(submitted, 2);
    assert.deepEqual(bodies[0], bodies[1], "retry must preserve the original form data");
    assert.match(String(bodies[0].endsAt), /^2099-10-01T\d{2}:35:00\.000Z$/);
    assert.equal(bodies[0].internalNote, "Test confidential reason");
  } finally { await browser.close(); }
});

test("TEST048 another claimant cannot submit and deleted evidence cannot be opened", { timeout: 30_000 }, async () => {
  const mutations: string[] = [];
  const browser = await fixture.page(({ path, method }) => {
    if (method !== "GET" && path.startsWith("/api/v1/admin/reports")) mutations.push(path);
    if (path === "/api/v1/admin/reports") return { data: { items: [{ id: "report048", targetType: "user", targetId: "target048", reporterName: "Reporter", reasonCode: "harassment", status: "in_review", createdAt: "2026-09-30T12:00:00Z" }], limit: 50, hasMore: false, nextCursor: "" } };
    if (path === "/api/v1/admin/reports/report048") return { data: { id: "report048", targetType: "user", targetId: "target048", detail: "Another reviewer's claim", status: "in_review", reasonCode: "harassment", claimedByCurrentUser: false, claimedByName: "Other moderator", canTakeover: false, evidence: [{ public_id: "evidence1", original_name: "deleted-evidence.txt", scan_status: "clean", status: "deleted" }], reviews: [], actions: [], relatedReports: [] } };
  });
  try {
    const { page } = browser;
    await navigateAdminPanel(page, fixture.origin, "Report review");
    await page.getByRole("button", { name: /user · harassment/ }).click();
    await page.getByText("Another reviewer's claim", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Submit decision", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Take over report", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /deleted-evidence.txt/ }).isDisabled(), true);
    assert.deepEqual(mutations, []);
  } finally { await browser.close(); }
});

test("authorship decisions refresh the selected queue after a filter change", { timeout: 30_000 }, async () => {
  const started = Promise.withResolvers<void>();
  const decision = Promise.withResolvers<void>();
  const reads: string[] = [];
  const writes: unknown[] = [];
  let committed = false;
  const relation = (name: string, status: string) => ({
    id: status === "pending" ? "pending01" : "approved01", projectType: "mod", projectId: "fixturemod", creatorId: name, creatorKind: "author", creatorName: name,
    roleName: "Maintainer", permissionGranting: true, status, createdAt: "2026-11-01T00:00:00Z",
  });
  const browser = await fixture.page(async ({ path, method, url, body }) => {
    const root = "/api/v1/admin/project-authorship-relations";
    if (path === root) {
      const status = url.searchParams.get("status")!;
      reads.push(status);
      const items = status === "pending" ? [relation("Pending creator", status)] : [relation(committed ? "Newly approved creator" : "Existing creator", status)];
      return { data: { items, nextCursor: "", hasMore: false } };
    }
    if (path === root + "/pending01" && method === "PATCH") {
      writes.push(JSON.parse(body)); started.resolve(); await decision.promise; committed = true; return { data: { status: "approved" } };
    }
  });
  try {
    const { page } = browser;
    await navigateAdminPanel(page, fixture.origin, "Project authorship relations");
    await page.getByPlaceholder("Review reason or audit note").fill("Verified relation");
    await page.getByRole("button", { name: "Approve", exact: true }).evaluate(button => {
      (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
    });
    await started.promise;
    await page.getByRole("button", { name: "Approved", exact: true }).click();
    await page.getByRole("link", { name: "Existing creator" }).waitFor();
    decision.resolve();
    await page.getByRole("link", { name: "Newly approved creator" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Pending creator" }).count(), 0);
    assert.deepEqual(writes, [{ status: "approved", note: "Verified relation" }]);
    assert.deepEqual(reads, ["pending", "approved", "approved"]);
  } finally { decision.resolve(); await browser.close(); }
});
