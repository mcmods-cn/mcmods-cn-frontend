import assert from "node:assert/strict";
import test from "node:test";
import { readBrowserStorage, writeBrowserStorage } from "./browser-storage.mts";

test("denied browser storage keeps in-tab state and does not break requests", () => {
  const previous = Reflect.get(globalThis, "window");
  const denied = {};
  Object.defineProperty(denied, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } });
  Reflect.set(globalThis, "window", denied);
  try {
    assert.equal(readBrowserStorage("audit-unset"), null);
    assert.equal(writeBrowserStorage("audit-locale", "fr-FR"), false);
    assert.equal(readBrowserStorage("audit-locale"), "fr-FR");
    const values = new Map<string, string>();
    Reflect.set(globalThis, "window", { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
    assert.equal(writeBrowserStorage("audit-locale", "en-US"), true);
    assert.equal(readBrowserStorage("audit-locale"), "en-US");
    values.delete("audit-locale");
    assert.equal(readBrowserStorage("audit-locale"), null);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", previous);
  }
});


test("readable old storage cannot undo a newer write rejected by quota", () => {
  const previous = Reflect.get(globalThis, "window");
  Reflect.set(globalThis, "window", { localStorage: {
    getItem: () => "old-value",
    setItem: () => { throw new DOMException("full", "QuotaExceededError"); },
  } });
  try {
    assert.equal(readBrowserStorage("audit-quota"), "old-value");
    assert.equal(writeBrowserStorage("audit-quota", "new-value"), false);
    assert.equal(readBrowserStorage("audit-quota"), "new-value");
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", previous);
  }
});
