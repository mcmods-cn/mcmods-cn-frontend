import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { ApiError } from "./api-error.mts";

type Form = { reset(): void; values: Map<string, string> };
type SubmitEvent = { preventDefault(): void; currentTarget: Form | null };
type Element = { type: unknown; props: { children?: unknown; onSubmit?: (event: SubmitEvent) => Promise<void> } };
const moduleURL = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
function forms(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(forms);
  if (!node || typeof node !== "object" || !("type" in node) || !("props" in node)) return [];
  const element = node as Element;
  return [...(element.type === "form" ? [element] : []), ...forms(element.props.children)];
}

// Production handlers run here. Hooks, event/FormData and HTTP are controlled
// boundaries; this does not claim a real browser or backend integration.
async function harness() {
  const key = `anti-abuse-lifecycle-${crypto.randomUUID()}`;
  const pending = Promise.withResolvers<unknown>();
  const messages: unknown[] = [];
  let mutations = 0;
  const boundary = {
    messages,
    request: (path: string, options: RequestInit) => {
      if (options.method) { mutations++; return pending.promise; }
      return Promise.resolve(path.endsWith("config") ? null : { items: [] });
    },
  };
  Reflect.set(globalThis, key, boundary);
  const hooks = moduleURL(`const f=globalThis[${JSON.stringify(key)}];export const useState=(v)=>[v,(next)=>f.messages.push(next)];export const useRef=(v)=>({current:v});export const useEffect=()=>{};export const useCallback=(fn)=>fn;`);
  const api = moduleURL(`export const apiRequest=(path,options)=>globalThis[${JSON.stringify(key)}].request(path,options);`);
  const translator = moduleURL("export const useI18n=()=>({locale:'en-US',t:(key)=>'translated:'+key});");
  const source = (await readFile(new URL("../_components/admin-anti-abuse-panel.tsx", import.meta.url), "utf8"))
    .replace('from "react"', `from ${JSON.stringify(hooks)}`)
    .replace('from "../_lib/api"', `from ${JSON.stringify(api)}`)
    .replace('from "../_lib/i18n-provider"', `from ${JSON.stringify(translator)}`)
    .replace(/from "\.\.\/_lib\/([^\"]+)"/g, (_, path: string) => `from ${JSON.stringify(new URL(path, import.meta.url).href)}`);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    .replace('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`);
  const original = Reflect.get(globalThis, "FormData");
  Reflect.set(globalThis, "FormData", class { private form: Form; constructor(form: Form) { this.form = form; } get(name: string) { return this.form.values.get(name) ?? null; } });
  try {
    const { AdminAntiAbusePanel } = await import(moduleURL(compiled));
    const handlers = forms(AdminAntiAbusePanel({ token: "cookie-session" })).map((form) => form.props.onSubmit!);
    return { handlers, pending, messages, mutations: () => mutations, close() { Reflect.set(globalThis, "FormData", original); Reflect.deleteProperty(globalThis, key); } };
  } catch (error) {
    Reflect.set(globalThis, "FormData", original); Reflect.deleteProperty(globalThis, key); throw error;
  }
}

for (const index of [0, 1]) test(`${index === 0 ? "restriction" : "bot rule"} submission captures its form across async event release and prevents duplicate writes`, async () => {
  const fixture = await harness();
  let resets = 0;
  const form: Form = { reset() { resets++; }, values: new Map([["reason", "Synthetic reason"], ["userId", "synthetic"], ["durationMinutes", "60"]]) };
  try {
    const event = { preventDefault() {}, currentTarget: form as Form | null };
    const first = fixture.handlers[index](event);
    event.currentTarget = null; // React no longer exposes currentTarget after dispatch.
    const duplicate = fixture.handlers[index]({ preventDefault() {}, currentTarget: form });
    assert.equal(fixture.mutations(), 1);
    await duplicate;
    fixture.pending.resolve({});
    await first;
    assert.equal(resets, 1);
  } finally { fixture.close(); }
});

test("failed administrator mutations report a stable localized error and keep the form", async () => {
  const fixture = await harness();
  let resets = 0;
  try {
    const operation = fixture.handlers[0]({ preventDefault() {}, currentTarget: { reset() { resets++; }, values: new Map() } });
    fixture.pending.reject(new ApiError("Synthetic denied operation", 403, "HTTP_403"));
    await operation; // No unhandled rejection escapes the event handler.
    assert.equal(resets, 0);
    assert.ok(fixture.messages.includes("translated:apiErrors.HTTP_403"));
  } finally { fixture.close(); }
});
