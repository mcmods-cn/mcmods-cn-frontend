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

test("container releases forward every documented optional public build input", async () => {
  const [release, dockerfile] = await Promise.all([read(".github/workflows/release-container.yml"), read("Dockerfile")]);
  const names = ["NEXT_PUBLIC_ICONFONT_SYMBOL_URL", "NEXT_PUBLIC_ICONFONT_SYMBOL_INTEGRITY", "NEXT_PUBLIC_CSP_CONNECT_ORIGINS", "NEXT_PUBLIC_CSP_IMAGE_ORIGINS", "NEXT_PUBLIC_CSP_MEDIA_ORIGINS", "NEXT_PUBLIC_CSP_FONT_ORIGINS"];
  for (const name of names) {
    assert.ok(release.includes(`${name}: \u0024{{ vars.${name} }}`), `${name} needs a release variable`);
    assert.ok(release.includes(`--build-arg ${name}="\u0024${name}"`), `${name} needs a build argument`);
    assert.ok(dockerfile.includes(`ARG ${name}\n`), `${name} must be declared`);
    assert.ok(dockerfile.includes(`ENV ${name}=\u0024${name}\n`), `${name} must reach Next's build`);
  }
  assert.doesNotMatch(release, /test -n "\$NEXT_PUBLIC_YGGDRASIL_API_ROOT"/, "optional discovery header must remain optional");
});
