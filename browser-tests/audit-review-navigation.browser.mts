import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(() => fixture.start());
after(() => fixture.close());

type Rule = { code: string; allow: boolean; priority: number };
// These are controlled API browser checks for navigation, not proof of backend
// scope filtering, independent moderation, or an actual PostgreSQL fixture.
for (const sample of [
  { name: "configured wildcard", rules: [{ code: "project.review.*", allow: true, priority: 10 }], visible: true },
  { name: "wildcard with one denied project", rules: [{ code: "project.review.*", allow: true, priority: 10 }, { code: "project.review.denied01", allow: false, priority: 20 }], visible: true },
  { name: "higher priority wildcard deny", rules: [{ code: "project.review.*", allow: true, priority: 10 }, { code: "project.review.*", allow: false, priority: 20 }], visible: false },
  { name: "equal priority wildcard deny", rules: [{ code: "project.review.*", allow: true, priority: 10 }, { code: "project.review.*", allow: false, priority: 10 }], visible: false },
  { name: "existing concrete scope", rules: [{ code: "project.review.allowed01", allow: true, priority: 10 }], visible: true },
  { name: "no review capability", rules: [], visible: false },
] satisfies Array<{ name: string; rules: Rule[]; visible: boolean }>) {
  test(`GR-004 review navigation respects ${sample.name}`, { timeout: 30_000 }, async () => {
    let queueReads = 0;
    const browser = await fixture.page(({ path }) => {
      if (path === "/api/v1/auth/me") return { data: { id: "configuredreviewer", username: "Configured reviewer", email: "reviewer@example.test", roleCodes: [], permissionRules: sample.rules, permissionVersion: 1, rbacVersion: 1 } };
      if (path === "/api/v1/reviews/content") { queueReads++; return { data: { items: [], total: 0, limit: 100, offset: 0 } }; }
      if (path === "/api/v1/location") return { data: { isMainlandChina: false } };
    });
    try {
      const { page } = browser;
      await page.goto(`${fixture.origin}/login`);
      await page.getByRole("link", { name: "Configured reviewer", exact: true }).focus();
      const navigation = page.locator('header a[href="/reviews"]');
      assert.equal(await navigation.count(), sample.visible ? 1 : 0);
      if (sample.visible) {
        await navigation.click();
        await page.waitForURL(`${fixture.origin}/reviews`);
        await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
        await page.getByRole("heading", { name: "Content review queue", exact: true }).waitFor();
        assert(queueReads > 0, "The eligible navigation reaches the real queue component and requests its API");
      }
    } finally { await browser.close(); }
  });
}
