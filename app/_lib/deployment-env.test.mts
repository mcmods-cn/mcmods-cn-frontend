import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publicAPIURL, resolvePublicDeploymentConfig, resolvePublicSiteURL } from "./deployment-env.mts";

test("development deployment configuration has safe local defaults", () => {
  assert.deepEqual(resolvePublicDeploymentConfig({}, "development"), {
    apiBaseURL: "http://localhost:8080",
    siteURL: "http://localhost:3000",
    yggdrasilAPIRoot: undefined,
  });
});

test("production deployment configuration requires and normalizes public HTTPS URLs", () => {
  assert.throws(
    () => resolvePublicDeploymentConfig({}, "production"),
    /NEXT_PUBLIC_API_BASE_URL is required/,
  );
  assert.throws(
    () => resolvePublicDeploymentConfig({ apiBaseURL: "https://api.example.test" }, "production"),
    /NEXT_PUBLIC_SITE_URL is required/,
  );
  assert.deepEqual(resolvePublicDeploymentConfig({
    apiBaseURL: "https://api.example.test/v1/",
    siteURL: "https://www.example.test/",
    yggdrasilAPIRoot: "https://auth.example.test/api/yggdrasil",
  }, "production"), {
    apiBaseURL: "https://api.example.test/v1",
    siteURL: "https://www.example.test",
    yggdrasilAPIRoot: "https://auth.example.test/api/yggdrasil/",
  });
});

test("public URL validation rejects unsafe or ambiguous production values", () => {
  const valid = { apiBaseURL: "https://api.example.test", siteURL: "https://www.example.test" };
  for (const apiBaseURL of [
    "http://api.example.test",
    "https://user:password@api.example.test",
    "https://api.example.test?token=secret",
    "file:///tmp/api",
  ]) {
    assert.throws(() => resolvePublicDeploymentConfig({ ...valid, apiBaseURL }, "production"));
  }
  for (const siteURL of [
    "http://www.example.test",
    "https://www.example.test/subpath",
    "https://www.example.test/#fragment",
  ]) {
    assert.throws(() => resolvePublicDeploymentConfig({ ...valid, siteURL }, "production"));
  }
  assert.throws(() => resolvePublicDeploymentConfig({
    ...valid,
    yggdrasilAPIRoot: "http://auth.example.test/api/yggdrasil",
  }, "production"));
  assert.equal(resolvePublicSiteURL(undefined, "development"), "http://localhost:3000");
});

test("public deployment URLs cannot leave appended paths inside an empty query or fragment", () => {
  const valid = { apiBaseURL: "https://api.example.test/service", siteURL: "https://www.example.test" };
  for (const suffix of ["?", "#", "?#"]) {
    for (const field of ["apiBaseURL", "siteURL", "yggdrasilAPIRoot"]) {
      assert.throws(() => resolvePublicDeploymentConfig({ ...valid, [field]: `https://example.test/${suffix}` }, "production"),
        /query string or fragment/);
    }
  }
  const config = resolvePublicDeploymentConfig({ ...valid, apiBaseURL: "https://api.example.test/service%3Fv%232/" }, "production");
  const endpoint = new URL(publicAPIURL("/api/v1/site/config", config.apiBaseURL));
  assert.equal(endpoint.pathname, "/service%3Fv%232/api/v1/site/config");
});

test("public deployment configuration has one committed and documented example contract", async () => {
  const [ignore, example, readme, nextConfig] = await Promise.all([
    readFile(new URL("../../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../../README.md", import.meta.url), "utf8"),
    readFile(new URL("../../next.config.ts", import.meta.url), "utf8"),
  ]);
  assert.match(ignore, /^!\.env\.example$/m);
  for (const name of [
    "NEXT_PUBLIC_API_BASE_URL",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_YGGDRASIL_API_ROOT",
    "NEXT_PUBLIC_ICONFONT_SYMBOL_URL",
    "NEXT_PUBLIC_ICONFONT_SYMBOL_INTEGRITY",
  ]) {
    assert.match(example, new RegExp(`^${name}=`, "m"));
    assert.match(readme, new RegExp(name));
  }
  for (const line of example.split(/\r?\n/)) {
    const [, value = ""] = line.split("=", 2);
    assert.doesNotMatch(value, /(?:password|secret|token)=|@/i);
  }
  assert.match(readme, /build[- ]time|构建期/i);
  assert.match(nextConfig, /resolvePublicDeploymentConfig/);
});
