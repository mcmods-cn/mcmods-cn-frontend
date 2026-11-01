import assert from "node:assert/strict";
import test from "node:test";
import { oauthProviderRedirect, oauthProviderStartPath, oauthProviders } from "./oauth-navigation.mts";

test("OAuth start preserves its existing providers and full validated return path", () => {
  for (const provider of oauthProviders) {
    const next = "/mods/synthetic?tab=data&version=1#recipe";
    const start = new URL(oauthProviderStartPath(provider.key, next), "https://site.example.test");
    assert.equal(start.pathname, "/login/provider");
    assert.equal(start.searchParams.get("provider"), provider.key);
    assert.equal(start.searchParams.get("next"), next);
    const destination = new URL(oauthProviderRedirect("https://api.example.test", start.searchParams.get("provider"), start.searchParams.get("next")));
    assert.equal(destination.origin, "https://api.example.test");
    assert.equal(destination.pathname, `/api/v1/auth/oauth/${provider.key}/start`);
    assert.equal(destination.searchParams.get("next"), next);
  }
});

test("OAuth start rejects unknown/ambiguous providers and untrusted return paths", () => {
  for (const provider of [undefined, ["github", "google"], "github/../admin", "unknown"]) assert.equal(oauthProviderRedirect("https://api.example.test", provider, "/user"), "");
  assert.equal(oauthProviderStartPath("unknown", "/user"), "");
  for (const next of ["https://external.example.test/", "//external.example.test/", "/\\external.example.test/", ["/user", "/admin"]]) {
    const destination = new URL(oauthProviderRedirect("https://api.example.test", "github", next));
    assert.equal(destination.search, "");
    assert.equal(new URL(oauthProviderStartPath("github", next), "https://site.example.test").searchParams.has("next"), false);
  }
});
