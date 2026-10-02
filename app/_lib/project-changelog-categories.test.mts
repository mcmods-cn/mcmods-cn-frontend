import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import type { ChangelogCategory } from "./project-changelog-api";

const moduleURL = (value: string) => `data:text/javascript;base64,${Buffer.from(value).toString("base64")}`;
test("category pages preserve target, locale, cursor and request cancellation in the actual API wrapper", async () => {
  const calls: Array<{ path: string; options: RequestInit; token?: string }> = [];
  const key = `changelog-categories-${crypto.randomUUID()}`;
  Reflect.set(globalThis, key, (path: string, options: RequestInit, token?: string) => { calls.push({ path, options, token }); return Promise.resolve({}); });
  try {
    const stub = moduleURL(`export const apiRequest=(...args)=>globalThis[${JSON.stringify(key)}](...args);`);
    const source = (await readFile(new URL("./project-changelog-api.ts", import.meta.url), "utf8")).replace('from "./api"', `from ${JSON.stringify(stub)}`);
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const api = await import(moduleURL(compiled)) as {
      loadProjectChangelogCategories: (type: string, id: string, locale: string, token: string, signal: AbortSignal, cursor: string) => Promise<unknown>;
      loadProjectChangelog: (id: string, token: string, signal: AbortSignal) => Promise<unknown>;
    };
    const signal = new AbortController().signal;
    await api.loadProjectChangelogCategories("mod", "target001", "zh-CN", "synthetic-token", signal, "opaque:+/cursor");
    const query = new URL(calls[0].path, "https://example.test");
    assert.equal(query.pathname, "/api/v1/changelogs/categories");
    assert.deepEqual(Object.fromEntries(query.searchParams), { targetType: "mod", targetId: "target001", locale: "zh-CN", cursor: "opaque:+/cursor" });
    assert.equal(calls[0].options.signal, signal);
    assert.equal(calls[0].options.cache, "no-store");
    assert.equal(calls[0].token, "synthetic-token");
    await api.loadProjectChangelog("entry/one", "synthetic-token", signal);
    assert.equal(calls[1].path, "/api/v1/changelogs/entry%2Fone");
    assert.equal(calls[1].options.signal, signal);
  } finally { Reflect.deleteProperty(globalThis, key); }
});

async function loadActualMerge() {
  const source = await readFile(new URL("../_components/project-changelog-editor.tsx", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("editor.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const merge = parsed.statements.find((item): item is ts.FunctionDeclaration => ts.isFunctionDeclaration(item) && item.name?.text === "mergeCategories");
  assert(merge);
  const compiled = ts.transpileModule(`export ${merge.getText(parsed)}`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return (await import(moduleURL(compiled))).mergeCategories as (categories: ChangelogCategory[], selected: ChangelogCategory | undefined, locale: string) => ChangelogCategory[];
}
const category = (id: string, name: string): ChangelogCategory => ({ id, defaultLocale: "en-US", name, names: { "en-US": name, "zh-CN": `中文 ${name}` } });
test("an edited category beyond page one remains selectable and follows interface language", async () => {
  const merge = await loadActualMerge();
  const firstPage = Array.from({ length: 100 }, (_, index) => category(`id${index}`, `Tag ${index}`));
  const selected = category("later-id", "Later tag");
  const result = merge(firstPage, selected, "zh-CN");
  assert.equal(result.length, 101);
  assert.equal(result.at(-1)?.id, "later-id");
  assert.equal(result.at(-1)?.name, "中文 Later tag");
  assert.equal(selected.name, "Later tag", "server/detail category snapshot is not mutated");
});
test("overlapping category pages update one option per ID and preserve default-language fallback", async () => {
  const merge = await loadActualMerge();
  const old = category("same-id", "Old tag");
  const fresh = category("same-id", "New tag");
  const result = merge([old, fresh, category("next-id", "Next tag")], old, "fr-FR");
  assert.equal(result.length, 2);
  assert.equal(result[0].name, "New tag");
  assert.equal(result[1].id, "next-id");
});
