import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildContentSecurityPolicy } from "./csp-policy.mts";

function directive(policy: string, name: string) {
  return policy.split("; ").find((item) => item.startsWith(`${name} `)) ?? "";
}

test("production CSP contains exact browser origins and no broad HTTPS scheme", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "nonce-value",
    production: true,
    apiBaseURL: "https://api.example.test/v1",
    connectOrigins: "https://uploads.example.test, https://telemetry.example.test",
    imageOrigins: "https://images.example.test",
    mediaOrigins: "https://media.example.test",
    fontOrigins: "https://fonts.example.test",
  });

  assert.match(directive(policy, "connect-src"), /https:\/\/api\.example\.test/);
  assert.match(directive(policy, "connect-src"), /https:\/\/uploads\.example\.test/);
  assert.match(directive(policy, "connect-src"), /https:\/\/challenges\.cloudflare\.com/);
  assert.match(directive(policy, "img-src"), /https:\/\/images\.example\.test/);
  assert.match(directive(policy, "img-src"), /https:\/\/oss\.mcmods\.cn/);
  assert.match(directive(policy, "media-src"), /https:\/\/media\.example\.test/);
  assert.match(directive(policy, "font-src"), /https:\/\/fonts\.example\.test/);
  assert.match(directive(policy, "frame-src"), /https:\/\/challenges\.cloudflare\.com/);
  for (const name of ["connect-src", "img-src", "media-src", "font-src"]) {
    assert.doesNotMatch(directive(policy, name), /(?:^|\s)https:(?:\s|$)/);
  }
  assert.match(policy, /script-src 'self' 'nonce-nonce-value' 'strict-dynamic'/);
  assert.match(policy, /upgrade-insecure-requests/);
});

test("CSP origin lists reject paths, credentials, wildcards, and insecure production sources", () => {
  for (const value of [
    "https://cdn.example.test/path",
    "https://user:secret@cdn.example.test",
    "https://*.example.test",
    "https://cdn.example.test?token=value",
    "data:",
    "'unsafe-inline'",
    "http://cdn.example.test",
  ]) {
    assert.throws(() => buildContentSecurityPolicy({
      nonce: "test",
      production: true,
      apiBaseURL: "https://api.example.test",
      imageOrigins: value,
    }), /origin|HTTPS/);
  }
});

test("development CSP permits only explicit loopback HTTP and websocket endpoints", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "dev",
    production: false,
    apiBaseURL: "http://localhost:8080/api",
    connectOrigins: "http://127.0.0.1:9000",
  });
  const connect = directive(policy, "connect-src");
  assert.match(connect, /http:\/\/localhost:8080/);
  assert.match(connect, /http:\/\/127\.0\.0\.1:9000/);
  assert.match(connect, /ws:\/\/localhost:\*/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
  assert.throws(() => buildContentSecurityPolicy({
    nonce: "dev",
    production: false,
    apiBaseURL: "http://localhost:8080",
    connectOrigins: "http://external.example.test",
  }), /HTTPS/);
});

test("proxy, environment example, and deployment docs use the CSP registry", async () => {
  const [proxy, example, readme] = await Promise.all([
    readFile(new URL("../../proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../../README.md", import.meta.url), "utf8"),
  ]);
  assert.match(proxy, /buildContentSecurityPolicy/);
  assert.doesNotMatch(proxy, /\["'self'",\s*"https:"\]/);
  for (const name of [
    "NEXT_PUBLIC_CSP_CONNECT_ORIGINS",
    "NEXT_PUBLIC_CSP_IMAGE_ORIGINS",
    "NEXT_PUBLIC_CSP_MEDIA_ORIGINS",
    "NEXT_PUBLIC_CSP_FONT_ORIGINS",
  ]) {
    assert.ok(example.includes(`${name}=`), `.env.example is missing ${name}`);
    assert.ok(readme.includes(name), `README is missing ${name}`);
  }
});
