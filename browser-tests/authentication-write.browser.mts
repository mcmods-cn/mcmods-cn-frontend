import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import * as module from "node:module";
// Runtime Node24 exposes this API; the project intentionally still uses
// @types/node20, so describe only the compile step required by this fixture.
const { stripTypeScriptTypes } = module as typeof module & { stripTypeScriptTypes: (source: string, options: { mode: "strip" }) => string };
import { test } from "node:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// Actual browser cookies, Web Locks, SharedWorker and HTTP. This isolates the
// authentication coordination component; it is not an API/PostgreSQL claim.
const helper = stripTypeScriptTypes(await readFile(new URL("../app/_lib/authentication-mutation.mts", import.meta.url), "utf8"), { mode: "strip" });
const worker = await readFile(new URL("../public/authentication-write-worker.js", import.meta.url), "utf8");
function deferred<T = void>() { let resolve!: (value: T | PromiseLike<T>) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
type Observation = { event: string; actor?: string; path?: string };
class Fixture {
  server?: Server; browser?: Browser; context?: BrowserContext; origin = "";
  events: Observation[] = [];
  held = deferred(); entered = deferred(); closed = deferred();
  holdConfiguration = false; configurationEntered = deferred(); configurationReleased = deferred(); configurationClosed = deferred();
  async start(noLocks = false) {
    this.server = createServer(async (req, res) => {
      const url = new URL(req.url!, this.origin);
      const json = (status: number, data: unknown, cookie?: string) => {
        res.writeHead(status, { "content-type": "application/json", ...(cookie ? { "set-cookie": cookie } : {}) }); res.end(JSON.stringify(data));
      };
      if (url.pathname === "/helper.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(helper); return; }
      if (url.pathname === "/authentication-write-worker.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end((noLocks ? 'Object.defineProperty(self.navigator,"locks",{value:undefined});\n' : "") + worker); return; }
      if (url.pathname === "/authentication-write-config") { if (this.holdConfiguration) { res.on("close", () => { if (!res.writableEnded) this.configurationClosed.resolve(); }); this.configurationEntered.resolve(); await this.configurationReleased.promise; } json(200, { apiBaseURL: this.origin }); return; }
      if (url.pathname === "/worker-capability.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end((noLocks ? 'Object.defineProperty(self.navigator,"locks",{value:undefined});\n' : "") + "postMessage({locks:!!navigator.locks,shared:typeof SharedWorker});"); return; }
      if (url.pathname === "/probe") { this.events.push({ event: "probe" }); json(200, {}); return; }
      if (url.pathname === "/api/v1/auth/me") {
        const actor = /mcmods_session=([AB])/.exec(req.headers.cookie ?? "")?.[1]; json(actor ? 200 : 401, actor ? { data: { id: actor } } : { error: "unauthenticated" }); return;
      }
      if (url.pathname.startsWith("/api/v1/auth/") && req.method === "POST") {
        const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.from(c));
        const body = Buffer.concat(chunks).toString(); const input = body ? JSON.parse(body) : {}; const actor = input.account ?? "guest";
        this.events.push({ event: "request", actor, path: url.pathname });
        if (url.pathname === "/api/v1/auth/logout") {
          res.on("close", () => { if (!res.writableEnded) { this.events.push({ event: "logout-client-closed" }); this.closed.resolve(); } });
          this.entered.resolve(); await this.held.promise;
          this.events.push({ event: "logout-response" }); json(200, { data: { ok: true } }, "mcmods_session=; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=0"); return;
        }
        if (actor === "network-failure") { req.socket.destroy(); return; }
        if (actor === "wrong-password") { json(401, { error: "Wrong password" }); return; }
        this.events.push({ event: "login-response", actor });
        if (actor === "oversized") { json(200, { data: { user: { id: "A" }, ignored: "x".repeat(1024 * 1024) } }, "mcmods_session=A; Path=/api/; HttpOnly; SameSite=Lax"); return; }
        json(200, { data: { user: { id: actor } } }, `mcmods_session=${actor}; Path=/api/; HttpOnly; SameSite=Lax`); return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><input id="account" value="preserved input"><div id="phase">idle</div><div id="identity">guest</div><script type="module">
import {runAuthenticationMutation} from '/helper.js';
window.ready=true;window.start=(path,account,holdPublish=false)=>{document.querySelector('#phase').textContent='queued';const controller=new AbortController();window.cancel=()=>controller.abort();window.result=runAuthenticationMutation(location.origin,async({fetch:send,assertCurrent})=>{document.querySelector('#phase').textContent='active';const response=await send(location.origin+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({account}),signal:controller.signal});const result=await response.json();if(!response.ok)throw Error(result.error);if(holdPublish){document.querySelector('#phase').textContent='publishing';await new Promise(resolve=>window.finishPublish=resolve);}assertCurrent();const id=result.data.user?.id||'guest';document.querySelector('#identity').textContent=id;const entries=JSON.parse(localStorage.getItem('publications')||'[]');entries.push(id);localStorage.setItem('publications',JSON.stringify(entries));return id;}).then(value=>{document.querySelector('#phase').textContent='done';return {ok:true,value};},error=>{document.querySelector('#phase').textContent='error';return {ok:false,name:error.name,error:error.message};});};
</script>`);
    });
    this.server.listen(0, "127.0.0.1"); await once(this.server, "listening"); const address = this.server.address(); assert(address && typeof address !== "string"); this.origin = `http://127.0.0.1:${address.port}`;
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({ serviceWorkers: "block" });
    // Simulate API absence in both real window and real worker globals. No
    // worker/fetch/lock is mocked, and the production worker bytes follow the
    // one capability shim unchanged. Chromium ignores guessed disable flags.
    if (noLocks) await this.context.addInitScript(() => Object.defineProperty(navigator, "locks", { value: undefined }));
    await this.context.addCookies([{ name: "mcmods_session", value: "A", url: this.origin + "/api/", httpOnly: true, sameSite: "Lax" }]);
    if (noLocks) {
      try {
      const p = await this.page(); assert.equal(await p.evaluate(() => !!navigator.locks), false, "The fallback browser must actually lack Web Locks");
      const capability = await p.evaluate(() => new Promise<{ locks: boolean }>(resolve => { const w = new Worker("/worker-capability.js"); w.onmessage = e => { resolve(e.data); w.terminate(); }; }));
      assert.equal(capability.locks, false, "The worker must actually lack Web Locks too"); await p.close();
      } catch (error) { await this.close(); throw error; }
    }
  }
  async page() { const p = await this.context!.newPage(); p.setDefaultTimeout(5000); await p.goto(this.origin); await p.waitForFunction(() => (window as unknown as { ready: boolean }).ready); return p; }
  async startWrite(p: Page, path: string, actor: string, hold = false) { await p.evaluate(({ path, actor, hold }) => (window as unknown as { start: (path: string, account: string, hold: boolean) => void }).start(path, actor, hold), { path, actor, hold }); }
  async result(p: Page) { return p.evaluate(() => (window as unknown as { result: Promise<{ ok: boolean; value?: string; name?: string; error?: string }> }).result); }
  async probe(p: Page) { await p.evaluate(() => fetch("/probe")); }
  async assertB() { const r = await this.context!.request.get(this.origin + "/api/v1/auth/me"); assert.equal(r.status(), 200); assert.equal((await r.json()).data.id, "B"); const cookie = (await this.context!.cookies(this.origin + "/api/v1/auth/me")).find(c => c.name === "mcmods_session"); assert(cookie?.httpOnly && cookie.path === "/api/"); assert.equal(cookie.value, "B"); }
  async close() { this.held.resolve(); this.configurationReleased.resolve(); await this.context?.close(); await this.browser?.close(); this.server?.closeAllConnections(); if (this.server) await new Promise<void>((resolve, reject) => this.server!.close(e => e ? reject(e) : resolve())); }
}

for (const noLocks of [false, true]) {
  const mechanism = noLocks ? "actual SharedWorker without Web Locks" : "native Web Locks";
  for (const endpoint of ["login", "email-login", "register"]) {
    test(`auth writes ${mechanism}: delayed logout precedes ${endpoint} across two tabs`, { timeout: 20_000 }, async () => {
      const f = new Fixture(); await f.start(noLocks);
      try {
        const a = await f.page(), b = await f.page(); await f.startWrite(a, "/api/v1/auth/logout", "A"); await f.entered.promise;
        await f.startWrite(b, "/api/v1/auth/" + endpoint, "B"); await f.probe(b);
        assert.equal(f.events.filter(e => e.event === "request" && e.actor === "B").length, 0, "B request must remain queued while actual A logout headers are held");
        if (!noLocks) { const locks = await b.evaluate(() => navigator.locks.query()); assert(locks.held?.some(l => l.name === "mcmods-authentication-write-v1")); assert(locks.pending?.some(l => l.name === "mcmods-authentication-write-v1")); }
        f.held.resolve(); assert.equal((await f.result(a)).ok, true); assert.deepEqual(await f.result(b), { ok: true, value: "B" }); await f.assertB();
        assert.deepEqual(await b.evaluate(() => JSON.parse(localStorage.getItem("publications")!)), ["guest", "B"]);
      } finally { await f.close(); }
    });
  }
  test(`auth writes ${mechanism}: success publication stays inside the queue`, { timeout: 20_000 }, async () => {
    const f = new Fixture(); await f.start(noLocks);
    try { const a = await f.page(), b = await f.page(); await f.startWrite(a, "/api/v1/auth/login", "A", true); await a.waitForFunction(() => document.querySelector("#phase")?.textContent === "publishing"); await f.startWrite(b, "/api/v1/auth/login", "B"); await f.probe(b); assert.equal(f.events.some(e => e.event === "request" && e.actor === "B"), false); await a.evaluate(() => (window as unknown as { finishPublish: () => void }).finishPublish()); assert.equal((await f.result(a)).value, "A"); assert.equal((await f.result(b)).value, "B"); await f.assertB(); assert.deepEqual(await b.evaluate(() => JSON.parse(localStorage.getItem("publications")!)), ["A", "B"]); } finally { await f.close(); }
  });
  for (const closeOwner of [false, true]) {
    test(`auth writes ${mechanism}: ${closeOwner ? "closing" : "cancelling"} the owner aborts old headers before queued login`, { timeout: 20_000 }, async () => {
      const f = new Fixture(); await f.start(noLocks);
      try { const a = await f.page(), b = await f.page(); await f.startWrite(a, "/api/v1/auth/logout", "A"); await f.entered.promise; await f.startWrite(b, "/api/v1/auth/login", "B"); await f.probe(b); if (closeOwner) await a.close(); else { await a.evaluate(() => (window as unknown as { cancel: () => void }).cancel()); assert.equal((await f.result(a)).ok, false); } await f.closed.promise; assert.equal((await f.result(b)).value, "B"); await f.assertB(); f.held.resolve(); await f.probe(b); await f.assertB(); assert.deepEqual(await b.evaluate(() => JSON.parse(localStorage.getItem("publications")!)), ["B"]); } finally { await f.close(); }
    });
  }
}
for (const failure of ["wrong-password", "network-failure", "oversized"]) {
  test(`SharedWorker auth ${failure} preserves the form and releases the queue for a genuine retry`, { timeout: 20_000 }, async () => {
    const f = new Fixture(); await f.start(true);
    try { const p = await f.page(); await f.startWrite(p, "/api/v1/auth/login", failure); const result = await f.result(p); assert.equal(result.ok, false); assert.equal(await p.locator("#account").inputValue(), "preserved input"); assert.equal(await p.locator("#identity").innerText(), "guest"); assert.equal(await p.evaluate(() => localStorage.getItem("publications")), null); await f.startWrite(p, "/api/v1/auth/login", "B"); assert.equal((await f.result(p)).value, "B"); await f.assertB(); } finally { await f.close(); }
  });
}
test("auth coordination unavailable is recoverable without an unsafe fallback", { timeout: 20_000 }, async () => {
  const f = new Fixture(); await f.start(true);
  try { const p = await f.page(); await p.evaluate(() => { const w = window as unknown as { previousSharedWorker: typeof SharedWorker; SharedWorker: typeof SharedWorker | undefined }; w.previousSharedWorker = SharedWorker; w.SharedWorker = undefined; }); await f.startWrite(p, "/api/v1/auth/login", "B"); assert.equal((await f.result(p)).ok, false); assert.equal(f.events.some(e => e.event === "request"), false); assert.equal(await p.locator("#account").inputValue(), "preserved input"); await p.evaluate(() => { const w = window as unknown as { previousSharedWorker: typeof SharedWorker; SharedWorker: typeof SharedWorker }; w.SharedWorker = w.previousSharedWorker; }); await f.startWrite(p, "/api/v1/auth/login", "B"); assert.equal((await f.result(p)).value, "B"); await f.assertB(); } finally { await f.close(); }
});
for (const noLocks of [false, true]) {
  test(`auth ${noLocks ? "SharedWorker" : "Web Locks"} keeps a frozen publisher queued until it resumes`, { timeout: 20_000 }, async () => {
    const f = new Fixture(); await f.start(noLocks);
    try { const a = await f.page(), b = await f.page(); await f.startWrite(a, "/api/v1/auth/login", "A", true); await a.waitForFunction(() => document.querySelector("#phase")?.textContent === "publishing"); const cdp = await f.context!.newCDPSession(a); await cdp.send("Page.setWebLifecycleState", { state: "frozen" }); await f.startWrite(b, "/api/v1/auth/login", "B"); await f.probe(b); assert.equal(f.events.some(e => e.event === "request" && e.actor === "B"), false); await cdp.send("Page.setWebLifecycleState", { state: "active" }); await a.evaluate(() => (window as unknown as { finishPublish: () => void }).finishPublish()); assert.equal((await f.result(a)).value, "A"); assert.equal((await f.result(b)).value, "B"); await f.assertB(); assert.deepEqual(await b.evaluate(() => JSON.parse(localStorage.getItem("publications")!)), ["A", "B"]); } finally { await f.close(); }
  });
}
test("a fallback window and native Web Locks window share the actual worker lock", { timeout: 20_000 }, async () => {
  const f = new Fixture(); await f.start();
  try { const a = await f.page(), b = await f.page(); await b.evaluate(() => Object.defineProperty(navigator, "locks", { value: undefined })); await f.startWrite(a, "/api/v1/auth/logout", "A"); await f.entered.promise; await f.startWrite(b, "/api/v1/auth/login", "B"); await f.probe(b); assert.equal(f.events.some(e => e.event === "request" && e.actor === "B"), false); f.held.resolve(); assert.equal((await f.result(a)).ok, true); assert.equal((await f.result(b)).value, "B"); await f.assertB(); } finally { await f.close(); }
});
test("the shared worker rejects a client-selected foreign API origin and can subsequently retry", { timeout: 20_000 }, async () => {
  const f = new Fixture(); await f.start(true);
  try {
    const p = await f.page();
    const rejected = await p.evaluate(() => new Promise<{ error?: string }>(resolve => {
      const worker = new SharedWorker("/authentication-write-worker.js", { name: "mcmods-authentication-write-v1" });
      const operationId = crypto.randomUUID(), id = crypto.randomUUID();
      worker.port.onmessage = e => {
        if (e.data.id === operationId && !e.data.error) worker.port.postMessage({ type: "fetch", operationId, id, url: "https://not-configured.example.invalid/api/v1/auth/login", method: "POST", headers: [], body: "{}" });
        else if (e.data.id === id) { worker.port.postMessage({ type: "ack", id: operationId }); resolve(e.data); }
      };
      worker.port.start(); worker.port.postMessage({ type: "begin", id: operationId });
    }));
    assert.equal(rejected.error, "Unsupported authentication write"); assert.equal(f.events.some(e => e.event === "request"), false);
    await f.startWrite(p, "/api/v1/auth/login", "B"); assert.equal((await f.result(p)).value, "B"); await f.assertB();
  } finally { await f.close(); }
});
for (const noLocks of [false, true]) {
  test(`auth ${noLocks ? "SharedWorker" : "Web Locks"} releases a closed publisher without publishing its stale result`, { timeout: 20_000 }, async () => {
    const f = new Fixture(); await f.start(noLocks);
    try { const a = await f.page(), b = await f.page(); await f.startWrite(a, "/api/v1/auth/login", "A", true); await a.waitForFunction(() => document.querySelector("#phase")?.textContent === "publishing"); await f.startWrite(b, "/api/v1/auth/login", "B"); await f.probe(b); assert.equal(f.events.some(e => e.event === "request" && e.actor === "B"), false); await a.close(); assert.equal((await f.result(b)).value, "B"); await f.assertB(); assert.deepEqual(await b.evaluate(() => JSON.parse(localStorage.getItem("publications")!)), ["B"]); } finally { await f.close(); }
  });
}
test("a cancelled SharedWorker callback cannot publish after a newer successful login", { timeout: 20_000 }, async () => {
  const f = new Fixture(); await f.start(true);
  try { const a = await f.page(), b = await f.page(); await f.startWrite(a, "/api/v1/auth/login", "A", true); await a.waitForFunction(() => document.querySelector("#phase")?.textContent === "publishing"); await f.startWrite(b, "/api/v1/auth/login", "B"); await a.evaluate(() => (window as unknown as { cancel: () => void }).cancel()); assert.equal((await f.result(b)).value, "B"); await f.assertB(); await a.evaluate(() => (window as unknown as { finishPublish: () => void }).finishPublish()); const old = await f.result(a); assert.equal(old.ok, false); assert.equal(old.name, "AbortError"); assert.deepEqual(await b.evaluate(() => JSON.parse(localStorage.getItem("publications")!)), ["B"]); await f.assertB(); } finally { await f.close(); }
});

test("SharedWorker cancels a closed owner's configuration read before queued authentication", { timeout: 20_000 }, async () => {
  const f = new Fixture(); f.holdConfiguration = true; await f.start(true);
  try { const a = await f.page(), b = await f.page(); await f.startWrite(a, "/api/v1/auth/logout", "A"); await f.configurationEntered.promise; await f.startWrite(b, "/api/v1/auth/login", "B"); f.holdConfiguration = false; await a.close(); await f.configurationClosed.promise; assert.equal((await f.result(b)).value, "B"); await f.assertB(); assert.equal(f.events.some(e => e.event === "request" && e.path?.endsWith("/logout")), false); f.configurationReleased.resolve(); await f.probe(b); await f.assertB(); } finally { await f.close(); }
});
