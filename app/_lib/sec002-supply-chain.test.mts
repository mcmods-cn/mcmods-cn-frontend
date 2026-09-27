import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SEC-002 audits the committed npm lockfile and archives the report before enforcement", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/dependency-audit.yml", import.meta.url), "utf8");
  for (const required of [
    "pull_request:",
    "schedule:",
    "npm audit --audit-level=high --json",
    "continue-on-error: true",
    "if: always()",
    "steps.npm_audit.outcome != 'success'",
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  ]) {
    assert.ok(workflow.includes(required), `dependency audit workflow is missing ${required}`);
  }
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/);
  assert.doesNotMatch(workflow, /npm install|npm ci/);
  const scanIndex = workflow.indexOf("id: npm_audit");
  const archiveIndex = workflow.indexOf("name: Archive npm audit report");
  const enforceIndex = workflow.indexOf("name: Enforce vulnerability gate");
  assert.ok(scanIndex >= 0 && archiveIndex > scanIndex && enforceIndex > archiveIndex);
});

test("SEC-002 retains patched transitive dependency floors in package and lock files", async () => {
  const [packageText, lockText] = await Promise.all([
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../package-lock.json", import.meta.url), "utf8"),
  ]);
  const packageJSON = JSON.parse(packageText) as { overrides?: Record<string, string> };
  const lockJSON = JSON.parse(lockText) as { packages?: Record<string, { version?: string }> };

  assert.deepEqual(packageJSON.overrides, {
    "js-yaml": "4.3.1",
    "nanoid": "3.3.18",
    "postcss": "8.5.23",
    "sharp": "0.35.3",
  });
  const braceVersions = Object.entries(lockJSON.packages ?? {})
    .filter(([path]) => path.endsWith("node_modules/brace-expansion"))
    .map(([, entry]) => entry.version ?? "");
  assert.ok(braceVersions.includes("5.0.9"));
  assert.ok(braceVersions.every((version) => !/^4\./.test(version) && !/^5\.0\.[0-8]$/.test(version)));
  assert.equal(lockJSON.packages?.["node_modules/js-yaml"]?.version, "4.3.1");
  assert.equal(lockJSON.packages?.["node_modules/nanoid"]?.version, "3.3.18");
});
