import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(async () => { await fixture.start(); });
after(async () => { await fixture.close(); });

const actors = [
  { name: "reader", width: 1320, canCreate: false, canAssign: false },
  { name: "writer-desktop", width: 1320, canCreate: true, canAssign: false },
  { name: "writer-mobile", width: 390, canCreate: true, canAssign: false },
  { name: "role-manager", width: 1320, canCreate: true, canAssign: true },
] as const;

for (const actor of actors) test(`account creation matches the user's capabilities (${actor.name})`, async () => {
  const requests: Record<string, unknown>[] = [];
  const rules = ["admin.access", "user.read", "permission.read"];
  if (actor.canCreate) rules.push("user.write");
  if (actor.canAssign) rules.push("permission.write");
  const browser = await fixture.page(request => {
    if (request.path === "/api/v1/auth/me") return { data: {
      id: "fixture01", username: "Fixture operator", sessionMarker: "a".repeat(43),
      permissionRules: rules.map(code => ({ code, allow: true, priority: 1 })),
    } };
    if (request.path === "/api/v1/admin/users" && request.method === "POST") {
      requests.push(JSON.parse(request.body));
      return { data: { id: "fixture02" }, status: 201 };
    }
  }, { viewport: { width: actor.width, height: 850 }, colorScheme: actor.width === 390 ? "dark" : "light" });
  try {
    const { page } = browser;
    await page.goto(fixture.origin + "/admin");
    const navToggle = page.locator('button[aria-controls="admin-navigation"]');
    await navToggle.waitFor({ state: "attached" });
    if (await navToggle.isVisible()) await navToggle.click();
    await page.locator('[data-admin-group="users"]').click();
    await page.locator('[data-admin-panel="users"]').click();
    await page.getByRole("heading", { name: "User list", exact: true }).first().waitFor();
    await page.getByRole("searchbox").waitFor();
    const evidenceDir = process.env.MCMODS_USER_CREATE_SCREENSHOTS;
    if (evidenceDir && actor.name.startsWith("writer-")) await page.screenshot({ path: join(evidenceDir, actor.name + ".png") });
    const createButton = page.getByRole("button", { name: "Create user", exact: true });
    assert.equal(await createButton.count(), actor.canCreate ? 1 : 0);
    const roles = page.getByLabel("Roles", { exact: true });
    assert.equal(await roles.count(), actor.canAssign ? 1 : 0);
    if (!actor.canCreate) {
      assert.deepEqual(requests, []);
      return;
    }
    await page.getByRole("textbox", { name: "Username", exact: true }).fill("fixture-new-user");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("new-user@example.invalid");
    await page.getByLabel("Initial password", { exact: true }).fill("test-only-password");
    if (actor.canAssign) await roles.fill("editor");
    await createButton.click();
    await page.getByText("User created", { exact: true }).waitFor();
    assert.equal(requests.length, 1);
    if (actor.canAssign) assert.deepEqual(requests[0].roles, ["editor"]);
    else assert.equal(Object.hasOwn(requests[0], "roles"), false);
  } finally { await browser.close(); }
});
