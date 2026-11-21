import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

const fixture = new ProductionBrowserFixture();
before(() => fixture.start());
after(() => fixture.close());

for (const committed of [false, true]) {
  test(`admin sign-out remains recoverable across tabs and reloads (committed=${committed})`, { timeout: 25_000 }, async () => {
    let writes = 0;
    let identityReads = 0;
    let confirmed = false;
    const firstRequest = Promise.withResolvers<void>();
    const firstReply = Promise.withResolvers<void>();
    const browser = await fixture.page(async ({ path, method, body }) => {
      if (path === "/api/v1/auth/me") {
        identityReads++;
        if (confirmed) return { status: 401, error: "Synthetic expired session" };
      }
      if (path === "/api/v1/auth/logout/if-current" && method === "POST") {
        assert.deepEqual(JSON.parse(body), { sessionMarker: "x".repeat(43) });
        if (++writes === 1) {
          firstRequest.resolve();
          await firstReply.promise;
          return committed
            ? { status: 503, code: "SECURITY_VERSION_REFRESH_FAILED", details: { operation: "logout", committed: true }, error: "Synthetic cache publication failure" }
            : { status: 503, error: "Synthetic transaction unavailable" };
        }
        confirmed = true;
        return committed ? { status: 401, error: "Synthetic expired session" } : { data: { ok: true } };
      }
    });
    try {
      const { page } = browser;
      await page.goto(`${fixture.origin}/admin`);
      await page.getByRole("button", { name: "Log out", exact: true }).click();
      await firstRequest.promise;
      await page.getByText("Signing out…", { exact: true }).waitFor();
      assert.equal(await page.locator("#admin-navigation").count(), 0);
      const readsBeforeReload = identityReads;
      firstReply.resolve();
      const message = committed ? "Your session was revoked. Some services are still updating. Retry shortly to confirm." : "The server hasn’t confirmed sign-out. Please retry.";
      await page.getByText(message, { exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, "/admin");
      await page.reload();
      await page.getByText(message, { exact: true }).waitFor();
      const other = await page.context().newPage();
      await other.goto(`${fixture.origin}/login?oauth=success`);
      await other.waitForURL(`${fixture.origin}/login`);
      await other.getByText(message, { exact: true }).waitFor();
      await other.goto(`${fixture.origin}/admin`);
      await other.getByText(message, { exact: true }).waitFor();
      assert.equal(identityReads, readsBeforeReload, "an unconfirmed sign-out cannot restore the original actor by reading the cookie");
      assert.equal(writes, 1, "no implicit replay on a reload or a second tab");
      await other.getByRole("button", { name: "Retry", exact: true }).click();
      await Promise.all([page.waitForURL("**/login?next=/admin"), other.waitForURL("**/login?next=/admin")]);
      assert.equal(writes, 2);
    } finally { firstReply.resolve(); await browser.close(); }
  });
}
