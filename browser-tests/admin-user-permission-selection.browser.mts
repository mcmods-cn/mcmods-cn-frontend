import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => fixture.start());
after(async () => fixture.close());

test("reselecting a loaded user preserves their permissions and the replacement draft", { timeout: 25_000 }, async () => {
  const currentGrant = { code: "fixture.permission.keep", allow: true, source: "manual", editable: true };
  const writes: unknown[] = [];
  let reads = 0;
  const browser = await fixture.page(({ path, method, body }) => {
    if (path === "/api/v1/admin/users") {
      return { data: [{ id: "r3testuser", username: "Synthetic permission owner", email: "fixture@example.invalid", status: "active", roleCodes: [] }] };
    }
    if (path === "/api/v1/admin/users/r3testuser/permissions") {
      if (method === "PUT") {
        writes.push(JSON.parse(body));
        return { data: { ok: true } };
      }
      reads++;
      return { data: { roles: [], groupPermissions: [], roleBindings: [], directPermissions: [currentGrant], effectivePermissionRules: [] } };
    }
  }, { viewport: { width: 1440, height: 900 } });

  try {
    const { page } = browser;
    await page.goto(`${fixture.origin}/admin`);
    await page.locator('[data-admin-group="workbench"]').waitFor();
    const panel = page.locator('[data-admin-panel="user-roles"]');
    if (await panel.count() === 0) await page.locator('[data-admin-group="permission"]').click();
    await panel.click();
    await page.locator('input[value="fixture.permission.keep"]').waitFor();
    const save = page.getByRole("button", { name: "Save user permissions", exact: true });
    assert.equal(await save.isEnabled(), true);

    await page.getByRole("button", { name: /^Synthetic permission owner/ }).click();
    const screenshot = process.env.MCMODS_USER_PERMISSION_SELECTION_SCREENSHOT;
    if (screenshot) await page.screenshot({ path: screenshot });
    await save.click();
    await page.getByText("User permissions saved.", { exact: true }).waitFor();

    assert.deepEqual(writes, [{ permissions: [currentGrant] }]);
    assert.equal(await page.locator('input[value="fixture.permission.keep"]').count(), 1);
    assert.equal(reads, 1);
  } finally {
    await browser.close();
  }
});
