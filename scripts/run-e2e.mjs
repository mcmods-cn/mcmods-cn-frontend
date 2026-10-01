#!/usr/bin/env node
// Browser contexts share one loopback IP and therefore one crawler read quota.
// Partition the suite without skipping tests, keeping the production policy.
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

if (process.argv.length !== 2) {
  throw new Error("For targeted browser tests, run npx playwright test with your arguments.");
}
const cli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
const lifecycle = "ordinary user edits persist and a private collection completes its lifecycle";

async function run(args, report) {
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "test", ...args], {
      stdio: "inherit",
      env: { ...process.env, MCMODS_E2E_REPORT_FILE: report },
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
  if (status !== 0) process.exit(status);
}

await run(["--grep-invert", lifecycle], "playwright-report/e2e-core-results.json");
console.log("Waiting for the shared 60-second crawler read window before the account journey.");
await setTimeout(60_000);
await run(["--grep", lifecycle], "playwright-report/e2e-account-results.json");
