import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

type Form = { reset(): void; values: Map<string, string> };
type SubmitEvent = { preventDefault(): void; currentTarget: Form | null };
type Element = { type: unknown; props: { children?: unknown; onSubmit?: (event: SubmitEvent) => Promise<void> } };
const moduleURL = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
function findForm(node: unknown): Element | undefined {
  if (Array.isArray(node)) return node.map(findForm).find(Boolean);
  if (!node || typeof node !== "object" || !("type" in node) || !("props" in node)) return;
  const element = node as Element;
  return element.type === "form" ? element : findForm(element.props.children);
}

async function harness(refreshFails: boolean) {
  const key = `admin-user-create-${crypto.randomUUID()}`;
  const pending = Promise.withResolvers<unknown>();
  let requests = 0;
  const messages: unknown[] = [];
  Reflect.set(globalThis, key, { request: () => { requests++; return pending.promise; }, messages });
  const source = await readFile(new URL("../_components/admin-console-users.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile("admin-console-users.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = file.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === "UsersPanelV2");
  assert(component, "test must exercise the real user creation handler");
  const hooks = moduleURL(`const f=globalThis[${JSON.stringify(key)}];export const useState=(v)=>[v,(n)=>f.messages.push(n)];export const useRef=(v)=>({current:v});export const useEffect=()=>{};`);
  const program = `import {useState,useRef,useEffect} from ${JSON.stringify(hooks)};
    const f=globalThis[${JSON.stringify(key)}];const apiRequest=()=>f.request();
    const useI18n=()=>({t:(key)=>key});const cleanError=(error)=>error.message;
    const PanelShell='fixture-panel',InlineMessage='fixture-message',EmptyState='fixture-empty';
    export ${component.getText(file)}`;
  const compiled = ts.transpileModule(program, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText.replace('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`);
  const original = Reflect.get(globalThis, "FormData");
  Reflect.set(globalThis, "FormData", class { private form: Form; constructor(form: Form) { this.form = form; } get(name: string) { return this.form.values.get(name) ?? null; } });
  const { UsersPanelV2 } = await import(moduleURL(compiled));
  const form = findForm(UsersPanelV2({ users: [], catalog: { roles: [], permissions: [] }, token: "synthetic", refreshUsers: async () => { if (refreshFails) throw new Error("Synthetic refresh failure"); } }));
  assert(form?.props.onSubmit);
  return { handler: form.props.onSubmit, pending, messages, requests: () => requests, close() { Reflect.set(globalThis, "FormData", original); Reflect.deleteProperty(globalThis, key); } };
}

for (const refreshFails of [false, true]) test(`administrator creation captures the event form and ${refreshFails ? "reports saved content despite refresh failure" : "prevents duplicate writes"}`, async () => {
  const fixture = await harness(refreshFails);
  let resets = 0;
  const form: Form = { reset() { resets++; }, values: new Map([["username", "synthetic"], ["email", "fixture@example.invalid"], ["password", "test-only-password"]]) };
  try {
    const event: SubmitEvent = { preventDefault() {}, currentTarget: form };
    const operation = fixture.handler(event);
    event.currentTarget = null;
    await fixture.handler({ preventDefault() {}, currentTarget: form });
    assert.equal(fixture.requests(), 1);
    fixture.pending.resolve({ id: "oct02usr1" });
    await operation;
    assert.equal(resets, 1);
    assert.ok(fixture.messages.includes("admin.userCreated"));
    if (refreshFails) assert.ok(fixture.messages.includes("admin.userCreated Synthetic refresh failure"));
  } finally { fixture.close(); }
});
