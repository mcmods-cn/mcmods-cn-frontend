// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import en from "../app/_locales/en-US";
import zhCN from "../app/_locales/zh-CN";
import zhTW from "../app/_locales/zh-TW";
import ja from "../app/_locales/ja";
import fr from "../app/_locales/fr";
import de from "../app/_locales/de";
import es from "../app/_locales/es";
import ru from "../app/_locales/ru";

type Dictionary = { [key: string]: string | Dictionary };
function messages(value: Dictionary, prefix = ""): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const dotted = prefix ? `${prefix}.${key}` : key;
    return typeof entry === "string" ? [[dotted, entry]] : Object.entries(messages(entry, dotted));
  }));
}
function parameters(message: string) {
  return [...new Set(Array.from(message.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g), (match) => match[1]))].sort();
}
const locales = { "en-US": en, "zh-CN": zhCN, "zh-TW": zhTW, ja, fr, de, es, ru };

describe("maintained static locale contracts", () => {
  it("rejects duplicate literal properties using the actual TypeScript parser", () => {
    const problems: string[] = [];
    for (const locale of Object.keys(locales)) {
      const file = path.resolve("app/_locales", `${locale}.ts`);
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isObjectLiteralExpression(node)) {
          const names = new Set<string>();
          for (const property of node.properties) {
            if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) continue;
            const name = property.name.text;
            if (names.has(name)) problems.push(`${locale}:${source.getLineAndCharacterOfPosition(property.getStart()).line + 1}:${name}`);
            names.add(name);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(problems).toEqual([]);
  });
  it("preserves the same keys and plain interpolation parameters in every effective dictionary", () => {
    const base = messages(en);
    const problems: string[] = [];
    for (const [locale, value] of Object.entries(locales)) {
      const localized = messages(value);
      for (const key of Object.keys(base)) {
        const translated = localized[key];
        if (typeof translated !== "string") problems.push(`${locale}:${key}:missing`);
        else if (!translated.trim()) problems.push(`${locale}:${key}:blank`);
        else if (JSON.stringify(parameters(base[key])) !== JSON.stringify(parameters(translated))) problems.push(`${locale}:${key}:parameters`);
      }
      for (const key of Object.keys(localized)) if (!(key in base)) problems.push(`${locale}:${key}:extra`);
    }
    expect(problems).toEqual([]);
  });
});
