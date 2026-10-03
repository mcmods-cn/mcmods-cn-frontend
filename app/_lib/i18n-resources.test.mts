import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

type Messages = { [key: string]: string | Messages };
const localeFiles = ["en-US", "zh-CN", "zh-TW", "de", "es", "fr", "ja", "ru"];

function flatten(messages: Messages, prefix = ""): Record<string, string> {
  return Object.fromEntries(Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [[path, value]] : Object.entries(flatten(value, path));
  }));
}

async function loadDictionary(name: string): Promise<Messages> {
  const url = new URL(`../_locales/${name}.ts`, import.meta.url);
  const source = (await readFile(url, "utf8")).replace(/from "(\.\/[^".]+)"/g, (_, specifier: string) => `from ${JSON.stringify(new URL(`${specifier}.ts`, url).href)}`);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`)).default as Messages;
}

function placeholders(message: string) {
  // This project's runtime uses simple {name} substitutions, not ICU syntax.
  return [...new Set([...message.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]))].sort();
}

test("locale source files parse and have no silently overwritten object keys", async () => {
  for (const name of localeFiles) {
    const source = await readFile(new URL(`../_locales/${name}.ts`, import.meta.url), "utf8");
    const file = ts.createSourceFile(`${name}.ts`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    // The compiler reports actual grammar errors; braces inside strings are data.
    const parsed = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ESNext } });
    assert.deepEqual((parsed.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error), [], name);
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const keys = new Set<string>();
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : property.name.getText(file);
          assert.equal(keys.has(key), false, `${name}: duplicate ${key} at line ${file.getLineAndCharacterOfPosition(property.getStart(file)).line + 1}`);
          keys.add(key);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
});

test("all effective locale keys, nonempty messages and runtime placeholders match English", async () => {
  const english = flatten(await loadDictionary("en-US"));
  for (const name of localeFiles) {
    const messages = flatten(await loadDictionary(name));
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(english).sort(), `${name}: effective key set`);
    for (const [key, message] of Object.entries(messages)) {
      assert.ok(message.trim(), `${name}: ${key} is blank`);
      assert.deepEqual(placeholders(message), placeholders(english[key]), `${name}: ${key} placeholder mismatch`);
    }
  }
});


test("statically named interface translations exist in the source dictionary", async () => {
  const keys = new Set(Object.keys(flatten(await loadDictionary("en-US"))));
  const roots = [new URL("../", import.meta.url), new URL("../../components/", import.meta.url)];
  const missing: string[] = [];
  for (const root of roots) for (const path of (await readdir(root, { recursive: true })).filter((path) => /\.(ts|tsx|mts)$/.test(path) && !path.includes(".test."))) {
    const source = await readFile(new URL(path, root), "utf8");
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const checkArgument = (argument: ts.Expression | undefined) => {
      if (!argument) return;
      if (ts.isStringLiteralLike(argument)) {
        if (!keys.has(argument.text)) missing.push(`${path}:${file.getLineAndCharacterOfPosition(argument.getStart(file)).line + 1} ${argument.text}`);
      } else if (ts.isConditionalExpression(argument)) {
        checkArgument(argument.whenTrue);
        checkArgument(argument.whenFalse);
      }
    };
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") checkArgument(node.arguments[0]);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  // Runtime-computed keys remain part of semantic review; do not guess them.
  assert.deepEqual(missing, [], "missing interface translation keys");
});
