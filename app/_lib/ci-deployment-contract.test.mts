import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relative: string) => readFile(path.join(root, relative), "utf8");

test("frontend CI and container delivery are executable contracts", async () => {
  const [ci, release, dockerfile, nextConfig] = await Promise.all([
    read(".github/workflows/ci.yml"),
    read(".github/workflows/release-container.yml"),
    read("Dockerfile"),
    read("next.config.ts"),
  ]);

  for (const required of ["npm ci", "npm test", "npm run typecheck", "npm run lint", "npm run build", "docker build --pull"]) {
    assert.match(ci, new RegExp(required.replaceAll(" ", "\\s+")));
  }
  assert.doesNotMatch(ci, /uses:\s+actions\/(?:checkout|setup-node)@v/);

  for (const required of ["tags:", "packages: write", "docker login ghcr.io", "sha-${GITHUB_SHA}", "Require production public origins"]) {
    assert.ok(release.includes(required), `release workflow is missing ${required}`);
  }
  for (const required of ["node:24.19.0-bookworm-slim", "npm ci", ".next/standalone", "USER nextjs"]) {
    assert.ok(dockerfile.includes(required), `Dockerfile is missing ${required}`);
  }
  assert.match(nextConfig, /output:\s*"standalone"/);
});
