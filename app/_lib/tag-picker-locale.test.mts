import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

test("tag browsing carries locale and cancellation and labels resolved fallback accurately", async () => {
  const key = `tag-picker-audit-${crypto.randomUUID()}`;
  const controller = new AbortController();
  Reflect.set(globalThis, key, async (query: URLSearchParams, token: string, signal: AbortSignal) => {
    assert.equal(query.get("locale"), "fr-FR");
    assert.equal(query.get("q"), "logs");
    assert.equal(token, "cookie-session");
    assert.equal(signal, controller.signal);
    return { items: [{ publicId: "synthetic", canonicalId: "minecraft:logs", registry: "minecraft:item", name: "Logs", locale: "en-US", previews: [] }], total: 1, limit: 40, offset: 0 };
  });
  const source = (await readFile(new URL("./resource-picker-loaders.ts", import.meta.url), "utf8")).replace('import { loadGlobalTags } from "./global-catalog-api";', `const loadGlobalTags = globalThis[${JSON.stringify(key)}];`);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  try {
    const loader = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
    const result = await loader.loadTagPickerPage({ locale: "fr-FR", query: "logs", registry: "minecraft:item", limit: 40, offset: 0 }, "cookie-session", controller.signal);
    assert.deepEqual(result.items[0].names, { "en-US": "Logs" });
  } finally { Reflect.deleteProperty(globalThis, key); }
});
