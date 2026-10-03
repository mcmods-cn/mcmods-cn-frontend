import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { hasSameI18nPlaceholders } from "./i18n-message.mts";

const moduleURL = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
type Controls = { getTranslationEditVersion(): string; setTranslation(locale: string, key: string, text: string): void; resetTranslation(locale: string, key: string): void; setTranslationsIfUnchanged(version: string, locale: string, texts: Record<string, string>): boolean };

// Run the actual provider mutation callbacks. React rendering and browser
// storage are controlled boundaries, not a provider or browser integration.
async function controls() {
  const key = `i18n-edit-test-${crypto.randomUUID()}`;
  const values = new Map<string, string>();
  Reflect.set(globalThis, key, { values });
  const react = moduleURL(`export const createContext=()=>({Provider:'fixture'});export const useCallback=(fn)=>fn;export const useContext=()=>null;export const useEffect=()=>{};export const useMemo=(fn)=>fn();export const useSyncExternalStore=(_subscribe,get)=>get();`);
  const storage = moduleURL(`const m=globalThis[${JSON.stringify(key)}].values;export const readBrowserStorage=(key)=>m.get(key)??null;export const writeBrowserStorage=(key,value)=>{m.set(key,value);return true;};`);
  let source = await readFile(new URL("./i18n-provider.tsx", import.meta.url), "utf8");
  source = source.replace('from "react"', `from ${JSON.stringify(react)}`).replace('from "./browser-storage.mts"', `from ${JSON.stringify(storage)}`)
    .replace(/from "\.\.\/_locales\/[^"]+"/g, `from ${JSON.stringify(moduleURL('export default {common:{greeting:"Hello {name}"}};'))}`)
    .replace(/from "\.\/([^\"]+\.mts)"/g, (_match, path: string) => `from ${JSON.stringify(new URL(path, import.meta.url).href)}`);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText.replace('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`);
  const originalWindow = Reflect.get(globalThis, "window");
  const originalDocument = Reflect.get(globalThis, "document");
  Reflect.set(globalThis, "window", new EventTarget());
  Reflect.set(globalThis, "document", { cookie: "mcmods-ui-locale=en-US" });
  const provider = await import(moduleURL(compiled));
  const element = provider.I18nProvider({ children: null }) as { props: { value: Controls } };
  return { controls: element.props.value, values, close() { Reflect.set(globalThis, "window", originalWindow); Reflect.set(globalThis, "document", originalDocument); Reflect.deleteProperty(globalThis, key); } };
}

test("a late AI completion cannot overwrite a manual edit or edit followed by reset", async () => {
  const fixture = await controls();
  try {
    const version = fixture.controls.getTranslationEditVersion();
    fixture.controls.setTranslation("fr-FR", "common.greeting", "Bonjour humain {name}");
    assert.equal(fixture.controls.setTranslationsIfUnchanged(version, "fr-FR", { "common.greeting": "AI {name}" }), false);
    assert.ok(fixture.values.get("mcmods-i18n-overrides")?.includes("Bonjour humain"));
    fixture.controls.resetTranslation("fr-FR", "common.greeting");
    const resetVersion = fixture.controls.getTranslationEditVersion();
    fixture.controls.setTranslation("fr-FR", "common.greeting", "temporary");
    fixture.controls.resetTranslation("fr-FR", "common.greeting");
    assert.equal(fixture.controls.setTranslationsIfUnchanged(resetVersion, "fr-FR", { "common.greeting": "AI {name}" }), false, "same final text still has a newer edit version");
  } finally { fixture.close(); }
});
test("AI completion accepts unchanged text and detects another tab's pending storage event", async () => {
  const fixture = await controls();
  try {
    const version = fixture.controls.getTranslationEditVersion();
    assert.equal(fixture.controls.setTranslationsIfUnchanged(version, "fr-FR", { "common.greeting": "Bonjour {name}" }), true);
    const second = fixture.controls.getTranslationEditVersion();
    fixture.values.set("mcmods-i18n-overrides", JSON.stringify({ "fr-FR": { "common.greeting": "Another tab {name}" } }));
    assert.equal(fixture.controls.setTranslationsIfUnchanged(second, "fr-FR", { "common.greeting": "AI {name}" }), false);
    const restoredTextVersion = fixture.controls.getTranslationEditVersion();
    fixture.values.set("mcmods-i18n-edit-version", "another-tab-edited-and-restored-text");
    assert.equal(fixture.controls.setTranslationsIfUnchanged(restoredTextVersion, "fr-FR", { "common.greeting": "AI {name}" }), false, "another tab's edit stamp protects restored text before storage events arrive");
  } finally { fixture.close(); }
});
test("local AI suggestions must preserve the runtime's real interpolation placeholders", () => {
  assert.equal(hasSameI18nPlaceholders("Hello {name} {count}", "{count}: {name}"), true);
  assert.equal(hasSameI18nPlaceholders("Hello {name}", "Bonjour"), false);
  assert.equal(hasSameI18nPlaceholders("Hello {name}", "{name} {extra}"), false);
});
