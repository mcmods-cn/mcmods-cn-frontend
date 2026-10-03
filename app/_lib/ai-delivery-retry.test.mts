import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { ApiError } from "./api-error.mts";
import { resolveAIDeliveryFailure } from "./ai-delivery-retry.mts";

const row = { id: "internal1", task_uid: "task00001", status: "queued", delivery_failure: { deadLetterId: "9007199254740993", stage: "publish", retryable: true } };
test("delivery retry accepts precise publisher-dead data and rejects consumers, unknown states and lossy IDs", () => {
  assert.equal(resolveAIDeliveryFailure(row)?.retryable, true);
  assert.equal(resolveAIDeliveryFailure(row)?.deadLetterId, "9007199254740993");
  for (const status of ["failed", "retrying", "running", "completed"]) assert.equal(resolveAIDeliveryFailure({ ...row, status })?.retryable, false);
  assert.equal(resolveAIDeliveryFailure({ ...row, delivery_failure: { ...row.delivery_failure, stage: "consume" } }), null);
  assert.equal(resolveAIDeliveryFailure({ ...row, delivery_failure: { ...row.delivery_failure, deadLetterId: 9 } }), null);
  assert.equal(resolveAIDeliveryFailure({ ...row, delivery_failure: { ...row.delivery_failure, retryable: "true" } }), null);
  assert.equal(resolveAIDeliveryFailure({ ...row, task_uid: undefined })?.retryable, false);
  assert.equal(resolveAIDeliveryFailure({ ...row, delivery_failure: { ...row.delivery_failure, deadLetterId: null } })?.retryable, false);
  assert.equal(resolveAIDeliveryFailure({ ...row, delivery_failure: undefined }), null);
});

type Element = { type: unknown; props: { children?: unknown; onClick?: () => void } };
const moduleURL = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("type" in value) || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}
async function harness(canEnqueue: boolean, failRefresh = false) {
  const key = `ai-delivery-${crypto.randomUUID()}`;
  const pending = Promise.withResolvers<unknown>();
  let posts = 0;
  let reads = 0;
  const state: unknown[] = [];
  const cleanup: Array<() => void> = [];
  const boundary = {
    canEnqueue, pending, state, cleanup,
    request(path: string, options: RequestInit) {
      if (options.method === "POST") { assert.equal(path, "/api/v1/admin/ai/tasks/task00001/retry-delivery"); posts++; return pending.promise; }
      reads++;
      if (failRefresh) return Promise.reject(new Error("synthetic refresh failure"));
      return Promise.resolve([{ ...row, delivery_failure: null }]);
    },
    resolveAIDeliveryFailure, ApiError,
  };
  Reflect.set(globalThis, key, boundary);
  const source = await readFile(new URL("../_components/admin-console-infrastructure.tsx", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("admin.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = parsed.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "AITaskLogsPanel");
  assert(component);
  const runtime = `const f=globalThis[${JSON.stringify(key)}];let index=0;
    const useState=(initial)=>{const i=index++;let v=typeof initial==='function'?initial():initial;if(i===0)v=[${JSON.stringify(row)}];f.state[i]=v;return[v,next=>{f.state[i]=typeof next==='function'?next(f.state[i]):next;}];};
    const useRef=(v)=>({current:v}),useCallback=(fn)=>fn,useEffectEvent=(fn)=>fn;
    const window={setTimeout:()=>0,clearTimeout:()=>{}};
    const useEffect=(fn)=>{const c=fn();if(c)f.cleanup.push(c);};
    const useI18n=()=>({t:key=>'translated:'+key}),useAuthSnapshot=()=>({user:{}}),hasPermission=()=>f.canEnqueue;
    const apiRequest=(...args)=>f.request(...args),resolveAIDeliveryFailure=f.resolveAIDeliveryFailure,ApiError=f.ApiError;
    const apiErrorMessage=(_e,_t,fallback)=>fallback,aiTranslationTaskTypes={i18n:'i18n'},displayCell=String,EmptyState=()=>null;
  `;
  const compiled = ts.transpileModule(runtime + `export ${component.getText(parsed)}`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    .replace('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`);
  try {
    const imported = await import(moduleURL(compiled)) as { AITaskLogsPanel(props: { token: string }): Element };
    const tree = imported.AITaskLogsPanel({ token: "cookie-session" });
    const button = elements(tree).find((node) => node.type === "button" && node.props.children === "translated:admin.ai.retryDelivery");
    return { button, pending, state, cleanup, posts: () => posts, reads: () => reads, close() { for (const fn of cleanup) fn(); Reflect.deleteProperty(globalThis, key); } };
  } catch (error) { Reflect.deleteProperty(globalThis, key); throw error; }
}
async function settle() { await new Promise<void>((resolve) => setImmediate(resolve)); }

test("actual delivery handler excludes same-tick duplicates and keeps accepted retry locked after refresh failure", async () => {
  const f = await harness(true, true);
  try {
    assert(f.button?.props.onClick);
    f.button.props.onClick(); f.button.props.onClick();
    assert.equal(f.posts(), 1);
    f.pending.resolve({ id: "task00001", status: "queued", deliveryQueued: true });
    await settle();
    assert.equal(f.reads(), 1);
    assert.equal(f.state[3], "translated:admin.ai.deliveryRetryRefreshFailed");
    assert.equal((f.state[5] as Map<string, string>).has("task00001"), true);
    f.button.props.onClick();
    assert.equal(f.posts(), 1, "accepted POST is not repeated even before a fresh render");
    assert.equal((f.state[0] as unknown[]).length, 1, "failed refresh preserves the task list");
  } finally { f.close(); }
});
test("actual delivery handler keeps rows after unavailable failure and permits a later explicit retry", async () => {
  const f = await harness(true);
  try {
    assert(f.button?.props.onClick);
    f.button.props.onClick();
    f.pending.reject(new ApiError("synthetic unavailable", 409, "AI_DELIVERY_RETRY_UNAVAILABLE"));
    await settle();
    assert.equal(f.state[3], "translated:admin.ai.deliveryRetryUnavailable");
    assert.equal((f.state[0] as unknown[]).length, 1);
    assert.equal(f.reads(), 0);
    f.button.props.onClick(); await settle();
    assert.equal(f.posts(), 2);
  } finally { f.close(); }
});
test("read-only actors receive no action and leaving the panel suppresses late retry publication", async () => {
  const reader = await harness(false);
  try { assert.equal(reader.button, undefined); assert.equal(reader.posts(), 0); } finally { reader.close(); }
  const writer = await harness(true);
  try {
    assert(writer.button?.props.onClick); writer.button.props.onClick();
    for (const fn of writer.cleanup) fn();
    writer.pending.resolve({ id: "task00001", status: "queued", deliveryQueued: true }); await settle();
    assert.equal(writer.reads(), 0);
    assert.equal((writer.state[5] as Map<string, string>).size, 0);
  } finally { writer.close(); }
});
