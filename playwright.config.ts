import { defineConfig } from "@playwright/test";

const baseURL = process.env.MCMODS_E2E_BASE_URL ?? "http://127.0.0.1:13000";
const parsed = new URL(baseURL);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error("E2E tests require an isolated loopback frontend");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
  use: {
    baseURL,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "off", // Auth traces contain test-session cookies; keep them out of artifacts.
  },
});
