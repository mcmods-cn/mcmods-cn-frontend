import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { recipeSlotAmountLabel } from "./recipe-slot-amount.mts";

// Execute the actual label and its real locale/number helpers. This bounded
// component harness supplies no replacement probability or role implementation.
async function functions(path: string, names: string[]) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return names.map(name => {
    const node = file.statements.find((entry): entry is ts.FunctionDeclaration => ts.isFunctionDeclaration(entry) && entry.name?.text === name);
    assert(node, `Actual function ${name} must exist`);
    return node.getText(file);
  }).join("\n");
}
const source = (await Promise.all([
  functions("./mod-export-api.ts", ["minecraftLocale"]),
  functions("./global-catalog-api.ts", ["contentLocales"]),
  functions("../_components/global-recipe-card.tsx", ["GlobalRecipeCandidateChanceLabel", "record", "numberValue"]),
])).join("\n") + "\nexport { GlobalRecipeCandidateChanceLabel };";
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`);
type LabelProps = { candidate: Record<string, unknown>; slot: Record<string, unknown>; locale: string };
const { GlobalRecipeCandidateChanceLabel: render } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`) as {
  GlobalRecipeCandidateChanceLabel(props: LabelProps): ReactElement<{ children: string; title: string }> | null;
};

test("NEW-FRONTEND-RECIPE-CHANCE-001 known primary and byproduct candidates each render their own probability", () => {
  for (const role of ["output", "byproduct"]) {
    const candidate = { amount: role === "byproduct" ? 2 : 4, chance_available: true, chance: .25, chance_percent: 25 };
    const before = structuredClone(candidate);
    const label = render({ candidate, slot: { role }, locale: "en-US" });
    assert(label, `${role} must retain its own known probability`);
    assert.equal(label.props.children, "25%");
    assert.equal(label.props.title, "25%");
    assert.match(renderToStaticMarkup(label), />25%<\/span>$/);
    assert.equal(recipeSlotAmountLabel(candidate), String(candidate.amount));
    assert.deepEqual(candidate, before, "Displaying probability must not alter quantity or source data");
  }
});

test("unknown candidates suppress numeric and text slot fallbacks for both output roles", () => {
  for (const role of ["output", "byproduct"]) {
    const candidate = { amount: 2, chance_available: false, chance: null, chance_percent: null, chance_text: "Chance: unknown" };
    assert.equal(render({ candidate, slot: { role, chance_available: true, chance: .75, chance_text: "75%" }, locale: "en-US" }), null);
    assert.equal(recipeSlotAmountLabel(candidate), "2");
  }
});

test("candidate probability takes precedence over legacy slot probability for either output role", () => {
  for (const role of ["output", "byproduct"]) {
    const label = render({ candidate: { chance: .25 }, slot: { role, chance: .75 }, locale: "en-US" });
    assert.equal(label?.props.children, "25%");
    assert.equal(render({ candidate: { byproduct: true }, slot: { role, chance: .75 }, locale: "en-US" }), null,
      "Candidate byproduct metadata must not invent a missing probability from a slot");
  }
});

test("legacy slot probability and localized text fallback remain available when candidates omit chance metadata", () => {
  for (const role of ["output", "byproduct"]) {
    assert.equal(render({ candidate: {}, slot: { role, probability: .5 }, locale: "en-US" })?.props.children, "50%");
    const localized = render({ candidate: {}, slot: { role, chance_texts: { zh_cn: "低概率" }, chance_text: "Rare" }, locale: "zh-CN" });
    assert.equal(localized?.props.children, "低概率");
    assert.equal(localized?.props.title, "低概率");
    assert.equal(render({ candidate: {}, slot: { role, chance_available: false, probability: .5 }, locale: "en-US" }), null);
  }
});

test("unrelated slot roles stay unlabeled and an explicit zero chance remains visible", () => {
  for (const role of ["input", "catalyst", "", undefined]) {
    assert.equal(render({ candidate: { chance_available: true, chance: .25 }, slot: { role }, locale: "en-US" }), null);
  }
  for (const role of ["output", "byproduct"]) {
    assert.equal(render({ candidate: { chance_available: true, chance: 0 }, slot: { role }, locale: "en-US" })?.props.children, "0%");
  }
});
