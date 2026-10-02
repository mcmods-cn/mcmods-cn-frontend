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
  const packageJSON = JSON.parse(packageText) as {
    overrides?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const lockJSON = JSON.parse(lockText) as { packages?: Record<string, { version?: string }> };

  assert.deepEqual(packageJSON.overrides, {
    "baseline-browser-mapping": "2.11.0",
    "brace-expansion@^1": "1.1.21",
    "brace-expansion@^5": "5.0.12",
    "browserslist": "4.28.7",
    "js-yaml": "4.3.2",
    "nanoid": "3.3.18",
    "postcss": "8.5.23",
    "sharp": "0.35.4",
  });
  const braceVersions = Object.entries(lockJSON.packages ?? {})
    .filter(([path]) => path.endsWith("node_modules/brace-expansion"))
    .map(([, entry]) => entry.version ?? "");
  assert.ok(braceVersions.includes("5.0.12"));
  assert.ok(braceVersions.includes("1.1.21"));
  assert.ok(braceVersions.every((version) => version === "1.1.21" || version === "5.0.12"));
  for (const [name, expected] of Object.entries({
    "baseline-browser-mapping": "2.11.0",
    "browserslist": "4.28.7",
    "js-yaml": "4.3.2",
    "sharp": "0.35.4",
    "next": "16.3.8",
    "eslint-config-next": "16.3.8",
  })) {
    assert.equal(lockJSON.packages?.[`node_modules/${name}`]?.version, expected, `${name} security floor`);
  }
  assert.equal(packageJSON.dependencies?.next, "16.3.8");
  assert.equal(packageJSON.devDependencies?.["eslint-config-next"], packageJSON.dependencies?.next);
  assert.equal(packageJSON.dependencies?.sharp, packageJSON.overrides?.sharp);
  assert.equal(lockJSON.packages?.["node_modules/nanoid"]?.version, "3.3.18");
});
