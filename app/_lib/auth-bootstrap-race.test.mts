import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

type User = { id: string; username: string; email: string; roleCodes: string[]; permissionRules: []; permissionVersion: number; rbacVersion: number };
const user = (id: string): User => ({ id, username: id, email: "synthetic@example.test", roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 });
const response = (data: User) => new Response(JSON.stringify({ data }), { status: 200 });

// Exercise the real auth module with only the HTTP boundary replaced. The
// bootstrap export exists in this in-memory test module, never in the app API.
async function fixture(logout = async () => new Response(JSON.stringify({ data: { ok: true } })), storage = new Map<string, string>()) {
  const pending: Array<(value: Response) => void> = [];
  const harnessKey = `mcmods-auth-test-${crypto.randomUUID()}`;
  const states: Array<{ value: { ready: boolean; token: string; user: User | null; logoutStatus?: string } }> = [];
  const effects: Array<() => void | (() => void)> = [];
  const requests: string[] = [];
  const harness = { states, effects, renderedToken: "", fetch: (url: string) => { requests.push(url); return url.endsWith("/logout") ? logout() : new Promise<Response>((resolve) => pending.push(resolve)); } };
  Reflect.set(globalThis, harnessKey, harness);
  const backendStatusURL = `data:text/javascript;base64,${Buffer.from("export const reportBackendAvailability=()=>{};").toString("base64")}`;
  const apiSource = ts.transpileModule((await readFile(new URL("./api.ts", import.meta.url), "utf8"))
    .replace('from "./backend-status"', `from ${JSON.stringify(backendStatusURL)}`)
    .replaceAll('from "./browser-storage.mts"', `from ${JSON.stringify(new URL("./browser-storage.mts", import.meta.url).href)}`)
    .replaceAll('from "./api-error.mts"', `from ${JSON.stringify(new URL("./api-error.mts", import.meta.url).href)}`)
    .replaceAll('from "./deployment-env.mts"', `from ${JSON.stringify(new URL("./deployment-env.mts", import.meta.url).href)}`)
    .replace('fetcher: typeof fetch = fetch', `fetcher: typeof fetch = globalThis[${JSON.stringify(harnessKey)}].fetch`),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;

  const apiURL = `data:text/javascript;base64,${Buffer.from(apiSource).toString("base64")}`;
  const api = await import(apiURL) as { API_BASE_URL: string; apiRequest: (path: string, options?: RequestInit) => Promise<unknown> };
  const reactSource = `const harness=globalThis[${JSON.stringify(harnessKey)}];export function useState(initial){const rendered=harness.renderedToken ? {...initial,token:harness.renderedToken} : initial;const state={value:rendered};harness.states.push(state);return [rendered,(next)=>{state.value=next;}];}export function useEffect(effect){harness.effects.push(effect);}`;
  const reactURL = `data:text/javascript;base64,${Buffer.from(reactSource).toString("base64")}`;
  const source = (await readFile(new URL("./auth.ts", import.meta.url), "utf8"))
    .replace('from "react"', `from ${JSON.stringify(reactURL)}`)
    .replace('from "./browser-storage.mts"', `from ${JSON.stringify(new URL('./browser-storage.mts', import.meta.url).href)}`)
    .replace('from "./authentication-mutation.mts"', `from ${JSON.stringify(new URL('./authentication-mutation.mts', import.meta.url).href)}`)
    .replace('from "./api"', `from ${JSON.stringify(apiURL)}`) + "\nexport { bootstrapAuth };";
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const auth = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`) as {
    retryAuthentication: () => Promise<User | null>;
    bootstrapAuth: (force?: boolean) => Promise<User | null>;
    useAuthSnapshot: () => { ready: boolean; token: string; user: User | null };
    clearAuth: () => Promise<boolean>;
    acceptOAuthSession: (isCurrent: () => boolean) => Promise<User | null>;
    updateAuthProfile: (previous: User, fields: { username: string }) => void;
    saveAuth: (value: { user: User; token?: string }) => void;
  };
  const fakeWindow = new EventTarget();
  Object.assign(fakeWindow, { atob, clearTimeout, setTimeout, localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  const oldFetch = globalThis.fetch;
  Reflect.set(globalThis, "fetch", harness.fetch);
  const oldWindow = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", fakeWindow);
  return { auth, api, pending, fakeWindow, states, storage, requests, mount(count: number, renderedToken = "") {
    harness.renderedToken = renderedToken;
    for (let index = 0; index < count; index++) auth.useAuthSnapshot();
    const cleanup = effects.splice(0).map((effect) => effect());
    return () => { for (const dispose of cleanup) dispose?.(); };
  }, cleanup() { globalThis.fetch = oldFetch; Reflect.deleteProperty(globalThis, harnessKey); if (oldWindow === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", oldWindow); } };
}

test("a pending me response cannot restore the user after logout", async () => {
  const f = await fixture();
  try {
    const old = f.auth.bootstrapAuth();
    const logout = f.auth.clearAuth();
    assert.equal(await f.auth.bootstrapAuth(true), null);
    f.pending.shift()!(response(user("old")));
    assert.equal(await old, null);
    assert.equal(await logout, true);
    const current = f.auth.bootstrapAuth();
    assert.equal(f.pending.length, 1, "logout must leave no cached authenticated user");
    f.pending.shift()!(new Response("{}", { status: 401 }));
    assert.equal(await current, null);
  } finally { f.cleanup(); }
});

test("an old bootstrap cannot overwrite a new login", async () => {
  const f = await fixture();
  try {
    const old = f.auth.bootstrapAuth();
    f.auth.saveAuth({ user: user("new") });
    f.pending.shift()!(response(user("old")));
    assert.equal(await old, null);
    assert.equal((await f.auth.bootstrapAuth())?.id, "new");
  } finally { f.cleanup(); }
});

test("an obsolete request finalizer cannot clear the current in-flight request", async () => {
  const f = await fixture();
  try {
    const old = f.auth.bootstrapAuth();
    assert.equal(await f.auth.clearAuth(), true);
    const current = f.auth.bootstrapAuth();
    f.pending.shift()!(response(user("old")));
    await old;
    const duplicate = f.auth.bootstrapAuth();
    assert.equal(f.pending.length, 1, "current bootstrap remains deduplicated");
    f.pending.shift()!(response(user("current")));
    assert.equal((await current)?.id, "current");
    assert.equal((await duplicate)?.id, "current");
  } finally { f.cleanup(); }
});


test("one cross-tab login invalidates once and publishes the new actor to every hook", async () => {
  const f = await fixture();
  const unmount = f.mount(3);
  try {
    assert.equal(f.pending.length, 1, "initial bootstrap is shared by all consumers");
    f.pending.shift()!(response(user("old-actor")));
    await f.auth.bootstrapAuth();
    await Promise.resolve();
    assert.deepEqual(f.states.map((state) => state.value.user?.id), ["old-actor", "old-actor", "old-actor"]);
    const event = new Event("storage");
    Object.assign(event, { key: "mcmods-auth-sync", newValue: "login:new-actor" });
    f.fakeWindow.dispatchEvent(event);
    assert.equal(f.pending.length, 1, "one storage event must create one shared authentication request");
    assert(f.states.every((state) => state.value.user === null), "old actor is removed before the new read");
    f.pending.shift()!(response(user("new-actor")));
    await f.auth.bootstrapAuth();
    await Promise.resolve();
    assert.deepEqual(f.states.map((state) => state.value.user?.id), ["new-actor", "new-actor", "new-actor"]);
  } finally { unmount(); f.cleanup(); }
});

test("local logout publishes an empty session without bootstrapping the old cookie", async () => {
  const f = await fixture();
  const unmount = f.mount(2);
  try {
    f.pending.shift()!(response(user("old-actor")));
    await f.auth.bootstrapAuth();
    const logout = f.auth.clearAuth();
    assert.equal(f.pending.length, 0, "logout must not issue me before the logout response clears the cookie");
    assert(f.states.every((state) => state.value.ready && state.value.user === null && state.value.token === ""));
    assert.equal(await logout, true);
  } finally { unmount(); f.cleanup(); }
});

for (const invalidHeader of [false, true]) {
  test(`a late ${invalidHeader ? "invalid header" : "401"} from the old session cannot clear a new login`, async () => {
    const f = await fixture();
    const unmount = f.mount(1);
    try {
      f.auth.saveAuth({ user: user("new-session") });
      f.pending.shift()!(new Response("{}", { status: invalidHeader ? 200 : 401, headers: invalidHeader ? { "x-mcmods-auth-state": "invalid" } : {} }));
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(f.states.at(-1)!.value.user?.id, "new-session");
    } finally { unmount(); f.cleanup(); }
  });
}

test("current invalid headers still expire the session", async () => {
  const f = await fixture();
  const unmount = f.mount(1);
  try {
    f.pending.shift()!(response(user("current")));
    await f.auth.bootstrapAuth();
    const current = f.auth.bootstrapAuth(true);
    f.pending.shift()!(new Response("{}", { headers: { "x-mcmods-auth-state": "invalid" } }));
    await current;
    assert.equal(f.states.at(-1)!.value.user, null);
  } finally { unmount(); f.cleanup(); }
});

test("a transient 429 exposes recovery and retries only the identity read", async () => {
  const f = await fixture();
  const unmount = f.mount(1);
  try {
    f.pending.shift()!(new Response("{}", { status: 429, headers: { "retry-after": "0" } }));
    await f.auth.bootstrapAuth();
    assert.equal((f.states.at(-1)!.value as { error?: string }).error, "429");
    assert.equal(f.states.at(-1)!.value.ready, false, "uncertain identity must not become an authenticated guest conclusion");
    assert.equal(f.pending.length, 0, "no automatic retry loop");
    const retry = f.auth.retryAuthentication();
    assert.equal(f.pending.length, 1);
    f.pending.shift()!(response(user("recovered")));
    await retry;
    assert.equal(f.states.at(-1)!.value.user?.id, "recovered");
  } finally { unmount(); f.cleanup(); }
});

for (const path of ["/api/v1/auth/login", "/api/v1/auth/email-login", "/api/v1/auth/register"]) {
  test(`invalid submitted credentials at ${path} preserve a current valid identity`, async () => {
    const f = await fixture();
    const unmount = f.mount(1);
    try {
      f.pending.shift()!(response(user("valid-B")));
      await f.auth.bootstrapAuth();
      const attempt = f.api.apiRequest(path, { method: "POST", body: JSON.stringify({ account: "invalid-submission" }) });
      f.pending.shift()!(new Response(JSON.stringify({ error: "Invalid submitted credentials" }), { status: 401 }));
      await assert.rejects(attempt, { status: 401 });
      assert.equal(f.states.at(-1)!.value.user?.id, "valid-B");
      assert.equal((await f.auth.bootstrapAuth())?.id, "valid-B");
    } finally { unmount(); f.cleanup(); }
  });
}

for (const invalidHeader of [false, true]) {
  test(`a genuinely current ${invalidHeader ? "invalid header on credential submission" : "protected 401"} still expires the identity`, async () => {
    const f = await fixture();
    const unmount = f.mount(1);
    try {
      f.pending.shift()!(response(user("revoked-B")));
      await f.auth.bootstrapAuth();
      const attempt = f.api.apiRequest(invalidHeader ? "/api/v1/auth/login" : "/api/v1/notifications", { method: invalidHeader ? "POST" : "GET" });
      f.pending.shift()!(new Response(JSON.stringify({ error: "Current session invalid" }), { status: 401, headers: invalidHeader ? { "x-mcmods-auth-state": "invalid" } : {} }));
      await assert.rejects(attempt, { status: 401 });
      assert.equal(f.states.at(-1)!.value.user, null);
    } finally { unmount(); f.cleanup(); }
  });
}
for (const sample of [
  { configured: "https://api.example.test/", normalized: "https://api.example.test" },
  { configured: "https://api.example.test/v1/", normalized: "https://api.example.test/v1" },
  { configured: "HTTPS://API.example.test:443/v1/", normalized: "https://api.example.test/v1" },
]) {
  test(`the real API module preserves supported public base normalization: ${sample.configured}`, async () => {
    const previous = process.env.NEXT_PUBLIC_API_BASE_URL;
    process.env.NEXT_PUBLIC_API_BASE_URL = sample.configured;
    const f = await fixture();
    try {
      assert.equal(f.api.API_BASE_URL, sample.normalized);
      const attempt = f.api.apiRequest("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ account: "synthetic" }) });
      assert.equal(f.requests.at(-1), sample.normalized + "/api/v1/auth/login");
      f.pending.shift()!(response(user("normalized-B")));
      await attempt;
    } finally {
      f.cleanup();
      if (previous === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
      else process.env.NEXT_PUBLIC_API_BASE_URL = previous;
    }
  });
}

const logoutFailure = (committed: boolean) => Response.json(committed
  ? { code: "SECURITY_VERSION_REFRESH_FAILED", details: { committed: true, operation: "logout" } }
  : { error: "Session storage unavailable" }, { status: 503 });

for (const committed of [false, true]) {
  test(`unconfirmed sign-out survives reload and retries the logout endpoint (committed=${committed})`, async () => {
    const storage = new Map<string, string>();
    const f = await fixture(async () => logoutFailure(committed), storage);
    const unmount = f.mount(1);
    try {
      f.pending.shift()!(response(user("A")));
      const previous = (await f.auth.bootstrapAuth())!;
      const attempt = f.auth.clearAuth();
      assert.equal(f.auth.clearAuth(), attempt, "repeated clicks share the in-flight write");
      assert.equal(f.states[0].value.logoutStatus, "pending");
      assert.equal(await attempt, false);
      f.auth.updateAuthProfile(previous, { username: "Late profile save" });
      assert.equal(await f.auth.retryAuthentication(), null, "permission refresh must not reuse the old cookie");
      assert.equal(f.states[0].value.logoutStatus, committed ? "revoked" : "retry");
      assert.equal(f.states[0].value.user, null);
      assert.equal(f.requests.filter(url => url.endsWith("/logout")).length, 1);
    } finally { unmount(); f.cleanup(); }
    const fresh = await fixture(async () => committed ? new Response("{}", { status: 401 }) : Response.json({ data: { ok: true } }), storage);
    const dispose = fresh.mount(1);
    try {
      assert.equal(fresh.states[0].value.logoutStatus, committed ? "revoked" : "retry");
      assert.equal(fresh.requests.length, 0, "reload must not bootstrap the cookie while logout is unresolved");
      assert.equal(await fresh.auth.clearAuth(), true);
      assert.equal(fresh.states[0].value.logoutStatus, undefined);
      assert.equal(fresh.states[0].value.user, null);
      assert.equal(fresh.requests.length, 1);
      assert.match(storage.get("mcmods-auth-sync")!, /^logout:/);
    } finally { dispose(); fresh.cleanup(); }
  });
}

test("a retry for the previous actor cannot send a write after another tab published a newer login", async () => {
  const f = await fixture(async () => logoutFailure(false));
  try {
    f.auth.saveAuth({ user: user("A") });
    const previous = (await f.auth.bootstrapAuth())!;
    assert.equal(await f.auth.clearAuth(), false);
    f.storage.set("mcmods-auth-sync", "login:newer"); // storage event still queued in this tab
    assert.equal(await f.auth.clearAuth(), false);
    assert.equal(f.requests.filter(url => url.endsWith("/logout")).length, 1);
    f.auth.saveAuth({ user: user("B") });
    f.auth.updateAuthProfile(previous, { username: "Old actor" });
    assert.equal((await f.auth.bootstrapAuth())?.id, "B");
  } finally { f.cleanup(); }
});

test("a superseded sign-out never publishes over a newer session", async () => {
  const entered = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<Response>();
  const f = await fixture(async () => { entered.resolve(); return reply.promise; });
  try {
    f.auth.saveAuth({ user: user("A") });
    const attempt = f.auth.clearAuth();
    await entered.promise;
    f.auth.saveAuth({ user: user("B") });
    const marker = f.storage.get("mcmods-auth-sync");
    reply.resolve(Response.json({ data: { ok: true } }));
    assert.equal(await attempt, false);
    assert.equal(f.storage.get("mcmods-auth-sync"), marker);
    assert.equal((await f.auth.bootstrapAuth())?.id, "B");
  } finally { f.cleanup(); }
});

test("an expired bearer only dismisses its own local identity and never sends a logout write", async () => {
  const token = `test.${Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url")}.test`;
  const f = await fixture();
  try {
    f.auth.saveAuth({ user: user("A"), token });
    f.mount(1, token)();
    assert.equal(f.states[0].value.user, null);
    assert.equal(f.states[0].value.logoutStatus, undefined);
    f.auth.saveAuth({ user: user("B") });
    f.mount(1, token)(); // A timer from A fires after B signed in.
    assert.equal((await f.auth.bootstrapAuth())?.id, "B");
    assert.equal(f.requests.length, 0);
  } finally { f.cleanup(); }
});

test("a new tab cannot confirm a legacy bearer sign-out by sending an unrelated cookie", async () => {
  const storage = new Map([["mcmods-auth-sync", "logout-pending:bearer:synthetic"]]);
  const f = await fixture(undefined, storage);
  const unmount = f.mount(1);
  try {
    assert.equal(await f.auth.clearAuth(), false);
    assert.equal(f.states[0].value.logoutStatus, "retry");
    assert.equal(f.requests.length, 0);
  } finally { unmount(); f.cleanup(); }
});

test("OAuth cookie confirmation cannot publish an older callback after sign-out or a subsequent login", async () => {
  const f = await fixture(async () => logoutFailure(false));
  try {
    const accepted = f.auth.acceptOAuthSession(() => true);
    f.pending.shift()!(response(user("A")));
    assert.equal((await accepted)?.id, "A", "a genuine current callback publishes its actor");
    const interrupted = f.auth.acceptOAuthSession(() => true);
    const oldCookieReply = f.pending.shift()!;
    await f.auth.clearAuth();
    oldCookieReply(response(user("A")));
    assert.equal(await interrupted, null);
    const reads = f.requests.length;
    assert.equal(await f.auth.acceptOAuthSession(() => true), null, "re-opening the callback URL must not restore A");
    assert.equal(f.requests.length, reads);
    f.auth.saveAuth({ user: user("B") });
    assert.equal((await f.auth.bootstrapAuth())?.id, "B", "an explicit new credential write may succeed");
    const stale = f.auth.acceptOAuthSession(() => true);
    f.storage.set("mcmods-auth-sync", "login:newer");
    f.pending.shift()!(response(user("old")));
    assert.equal(await stale, null);
    assert.equal((await f.auth.bootstrapAuth())?.id, "B");
  } finally { f.cleanup(); }
});
