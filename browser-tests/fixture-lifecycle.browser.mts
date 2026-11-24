import assert from "node:assert/strict";
import test from "node:test";
import { ProductionBrowserFixture } from "./fixture.mts";

test("a failed browser launch can be cleaned up again by the suite teardown", { timeout: 30_000 }, async () => {
  const fixture = new ProductionBrowserFixture();
  const originalChannel = process.env.MCMODS_BROWSER_CHANNEL;
  process.env.MCMODS_BROWSER_CHANNEL = "mcmods-nonexistent-test-channel";
  try {
    await assert.rejects(fixture.start(() => ({ data: { siteName: "Fixture" } })), /mcmods-nonexistent-test-channel/);
    await fixture.close();
  } finally {
    if (originalChannel === undefined) delete process.env.MCMODS_BROWSER_CHANNEL;
    else process.env.MCMODS_BROWSER_CHANNEL = originalChannel;
  }
});
