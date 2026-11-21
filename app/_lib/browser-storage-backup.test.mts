import assert from "node:assert/strict";
import test from "node:test";

test("a tab recovers an auth hint after reload when shared writes fail and yields to a newer shared login", async () => {
  const oldWindow = Reflect.get(globalThis, "window");
  const tab = new Map<string, string>();
  let shared = "initial-login";
  Reflect.set(globalThis, "window", {
    localStorage: { getItem: () => shared, setItem: () => { throw new DOMException("full", "QuotaExceededError"); } },
    sessionStorage: {
      getItem: (key: string) => tab.get(key) ?? null,
      setItem: (key: string, value: string) => tab.set(key, value),
      removeItem: (key: string) => tab.delete(key),
    },
  });
  try {
    const initial = await import("./browser-storage.mts");
    initial.writeBrowserStorage("auth-sync", "pending-bound", true);
    const fresh = await import(new URL("./browser-storage.mts?reloaded", import.meta.url).href) as typeof initial;
    assert.equal(fresh.readBrowserStorage("auth-sync", true), "pending-bound");
    shared = "another-tab-signed-in";
    assert.equal(fresh.readBrowserStorage("auth-sync", true), shared);
    assert(!tab.has("auth-sync"));
  } finally {
    if (oldWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Reflect.set(globalThis, "window", oldWindow);
  }
});
