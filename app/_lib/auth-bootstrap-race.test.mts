import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

type User = { id: string; username: string; email: string; roleCodes: string[]; permissionRules: []; permissionVersion: number; rbacVersion: number };
const user = (id: string): User => ({ id, username: id, email: "synthetic@example.test", roleCodes: [], permissionRules: [], permissionVersion: 1, rbacVersion: 1 });
const response = (data: User) => new Response(JSON.stringify({ data }), { status: 200 });

// Exercise the real auth module with only the HTTP boundary replaced. The
// bootstrap export exists in this in-memory test module, never in the app API.
async function fixture() {
  const pending: Array<(value: Response) => void> = [];
  const harnessKey = `mcmods-auth-test-${crypto.randomUUID()}`;
  const states: Array<{ value: { ready: boolean; token: string; user: User | null } }> = [];
  const effects: Array<() => void | (() => void)> = [];
  const harness = { states, effects, fetch: (url: string) => url.endsWith("/logout") ? Promise.resolve(new Response("{}")) : new Promise<Response>((resolve) => pending.push(resolve)) };
  Reflect.set(globalThis, harnessKey, harness);
  const apiSource = `export const API_BASE_URL="http://127.0.0.1";export const backendFetch=(url)=>globalThis[${JSON.stringify(harnessKey)}].fetch(url);export const isBearerAccessToken=(value)=>Boolean(value?.split('.').length===3);export const rememberAuthorizationVersion=()=>{};`;
  const apiURL = `data:text/javascript;base64,${Buffer.from(apiSource).toString("base64")}`;
  const reactSource = `const harness=globalThis[${JSON.stringify(harnessKey)}];export function useState(initial){const state={value:initial};harness.states.push(state);return [initial,(next)=>{state.value=next;}];}export function useEffect(effect){harness.effects.push(effect);}`;
  const reactURL = `data:text/javascript;base64,${Buffer.from(reactSource).toString("base64")}`;
  const source = (await readFile(new URL("./auth.ts", import.meta.url), "utf8"))
    .replace('from "react"', `from ${JSON.stringify(reactURL)}`)
    .replace('from "./browser-storage.mts"', `from ${JSON.stringify(new URL('./browser-storage.mts', import.meta.url).href)}`)
    .replace('from "./api"', `from ${JSON.stringify(apiURL)}`) + "\nexport { bootstrapAuth };";
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const auth = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`) as {
    bootstrapAuth: (force?: boolean) => Promise<User | null>;
    useAuthSnapshot: () => { ready: boolean; token: string; user: User | null };
    clearAuth: () => void;
    saveAuth: (value: { user: User }) => void;
  };
  const fakeWindow = new EventTarget();
  Object.assign(fakeWindow, { localStorage: { setItem() {} } });
  const oldWindow = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", fakeWindow);
  return { auth, pending, fakeWindow, states, mount(count: number) {
    for (let index = 0; index < count; index++) auth.useAuthSnapshot();
    const cleanup = effects.splice(0).map((effect) => effect());
    return () => { for (const dispose of cleanup) dispose?.(); };
  }, cleanup() { Reflect.deleteProperty(globalThis, harnessKey); if (oldWindow === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", oldWindow); } };
}

test("a pending me response cannot restore the user after logout", async () => {
  const f = await fixture();
  try {
    const old = f.auth.bootstrapAuth();
    f.auth.clearAuth();
    f.pending.shift()!(response(user("old")));
    assert.equal(await old, null);
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
    f.auth.clearAuth();
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
    f.auth.clearAuth();
    assert.equal(f.pending.length, 0, "logout must not issue me before the logout response clears the cookie");
    assert(f.states.every((state) => state.value.ready && state.value.user === null && state.value.token === ""));
  } finally { unmount(); f.cleanup(); }
});
