import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import ts from "typescript";

async function importSource(path: string, aliases: Record<string, string> = {}) {
  const url = new URL(path, import.meta.url);
  const source = (await readFile(url, "utf8")).replace(/from "(\.\/[^\"]+)"/g, (_, specifier: string) => `from ${JSON.stringify(aliases[specifier] ?? new URL(/\.(?:mts|ts)$/.test(specifier) ? specifier : `${specifier}.ts`, url).href)}`);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}

test("real HTTP 204 mutations complete and malformed successful envelopes fail explicitly", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/empty" || request.url === "/api/v1/ratings/mod/synthetic") { response.writeHead(204); response.end(); return; }
    if (request.url === "/api/v1/ratings/mod/missing") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Synthetic rating missing", code: "RATING_NOT_FOUND" }));
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(request.url === "/valid" ? JSON.stringify({ data: { saved: true } }) : "{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const original = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = `http://127.0.0.1:${address.port}`;
  try {
    const apiURL = await importSource("./api.ts");
    const api = await import(apiURL);
    const rating = await import(await importSource("./rating-api.ts", { "./api": apiURL }));
    assert.equal(await api.apiRequest("/empty", { method: "DELETE" }), undefined);
    assert.equal(await rating.deleteRating("mod", "synthetic", "cookie-session"), undefined);
    await assert.rejects(rating.deleteRating("mod", "missing"), { status: 404, code: "RATING_NOT_FOUND" });
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(rating.getRatingSummary("mod", "cancelled", undefined, cancelled.signal), { name: "AbortError" });
    assert.deepEqual(await api.apiRequest("/valid"), { saved: true });
    await assert.rejects(api.apiRequest("/malformed"), { code: "API_RESPONSE_EMPTY" });
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = original;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("favorite export cookie sessions never become an invalid Bearer token", async () => {
  const headers: Array<string | null> = [];
  const key = `favorite-download-test-${crypto.randomUUID()}`;
  Reflect.set(globalThis, key, (init: RequestInit) => {
    headers.push(new Headers(init.headers).get("Authorization"));
    return Promise.resolve(new Response(JSON.stringify({ code: "HTTP_403" }), { status: 403 }));
  });
  const mock = `data:text/javascript;base64,${Buffer.from(`export const API_BASE_URL='http://127.0.0.1';export class ApiError extends Error {constructor(m,status){super(m);this.status=status}};export const apiRequest=()=>{};export const isBearerAccessToken=(token)=>Boolean(token&&token.split('.').length===3);export const backendFetch=(_url,init)=>globalThis[${JSON.stringify(key)}](init);`).toString("base64")}`;
  try {
    const favorite = await import(await importSource("./favorite-api.ts", { "./api": mock }));
    await assert.rejects(favorite.downloadFavoriteModpackExport("cookie-session", "synthetic", "fixture"), { status: 403 });
    await assert.rejects(favorite.downloadFavoriteModpackExport("header.payload.signature", "synthetic", "fixture"), { status: 403 });
    assert.deepEqual(headers, [null, "Bearer header.payload.signature"]);
  } finally { Reflect.deleteProperty(globalThis, key); }
});
