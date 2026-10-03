import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

type Element = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
type EventHandler = (...args: unknown[]) => unknown;
const moduleURL = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("type" in node) || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function handler(element: Element, key: string): EventHandler {
  const value = element.props[key];
  assert.equal(typeof value, "function");
  return value as EventHandler;
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

// Actual component handlers and actual shared batch processor are retained.
// React hook storage, HTTP upload and application boundaries are deterministic.
for (const kind of ["creator", "project"] as const) for (const mode of ["complete", "unmount"] as const) test(`${kind} application ${mode === "complete" ? "preserves uploaded proofs across partial failure and serializes retries" : "stops further uploads and ignores late results after unmount"}`, async () => {
  const sourcePath = kind === "creator" ? "app/_components/creator-detail.tsx" : "app/_components/project-editor-application.tsx";
  const name = kind === "creator" ? "ClaimCreatorDialog" : "ProjectEditorApplicationDialog";
  const source = process.env.MCMODS_TEST_COMPONENT_BASELINE
    ? execFileSync("git", ["show", `262e1c0136bfed4624a011cf5f445b1d71cf93c0:${sourcePath}`], { encoding: "utf8" })
    : await readFile(new URL(`../../${sourcePath}`, import.meta.url), "utf8");
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = file.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert(component);
  const key = `application-attachment-${crypto.randomUUID()}`;
  const firstUpload = Promise.withResolvers<unknown>();
  const uploadCalls: string[] = [];
  const applicationCalls: Array<{ body: string }> = [];
  const pendingApplications: Array<ReturnType<typeof Promise.withResolvers<unknown>>> = [];
  const states: Array<{ value: unknown }> = [];
  const refs: Array<{ current: unknown }> = [];
  let closed = 0;
  let submitted = 0;
  let stateCursor = 0;
  let refCursor = 0;
  let failSecond = true;
  let effectCursor = 0;
  const effectCleanups: Array<(() => void) | undefined> = [];
  const record = (id: string, name: string) => ({ id, originalName: name, sizeBytes: 1 });
  const fixture = {
    state(initial: unknown) {
      const index = stateCursor++;
      const state = states[index] ?? (states[index] = { value: initial });
      return [state.value, (next: unknown) => { state.value = typeof next === "function" ? (next as (value: unknown) => unknown)(state.value) : next; }];
    },
    ref(initial: unknown) { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); },
    effect(callback: () => (() => void) | undefined) {
      const index = effectCursor++;
      if (!(index in effectCleanups)) effectCleanups[index] = callback();
    },
    upload(file: File) {
      uploadCalls.push(file.name);
      if (file.name === "first.txt") return firstUpload.promise;
      if (failSecond) { failSecond = false; return Promise.reject(new Error("Synthetic second upload failed")); }
      return Promise.resolve(record("file-second", file.name));
    },
    request(_path: string, options: { body: string }) {
      applicationCalls.push(options);
      const pending = Promise.withResolvers<unknown>();
      pendingApplications.push(pending);
      return pending.promise;
    },
  };
  Reflect.set(globalThis, key, fixture);
  const program = `import {createOSSUploadBatchTasks,processOSSUploadBatch} from ${JSON.stringify(new URL("./oss-upload-batch.mts", import.meta.url).href)};
    const f=globalThis[${JSON.stringify(key)}];
    const useState=(v)=>f.state(v),useRef=(v)=>f.ref(v),useEffect=(callback)=>f.effect(callback),useMemo=(f)=>f();
    const useI18n=()=>({t:(key)=>key});const apiErrorMessage=(error)=>error.message;
    const uploadUserFileToOSS=(file)=>f.upload(file),apiRequest=(path,options)=>f.request(path,options);
    const notifySite=()=>{},formatBytes=(value)=>String(value);
    const claimMaximumFiles=5,claimMaximumBytes=10485760;
    const FileDropZone='fixture-drop',OSSUploadBatchStatus='fixture-status';
    export ${component.getText(file)}`;
  const compiled = ts.transpileModule(program, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText.replace('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`);
  const imported = await import(moduleURL(compiled));
  const render = () => {
    stateCursor = 0; refCursor = 0; effectCursor = 0;
    return elements(imported[name]({ creator: { publicId: "creator01", name: "Synthetic author" }, projectId: "project01", projectType: "mod", projectName: "Synthetic project", token: "synthetic", onClose: () => { closed++; }, onSubmitted: () => { submitted++; } }));
  };
  try {
    let tree = render();
    const drop = tree.find((element) => element.type === "fixture-drop")!;
    const form = tree.find((element) => element.type === "form")!;
    const close = tree.find((element) => element.type === "button" && element.props.children === "common.close")!;
    const files = [new File(["a"], "first.txt"), new File(["b"], "second.txt")];
    handler(drop, "onFiles")(files);
    handler(drop, "onFiles")(files);
    const prematureSubmit = handler(form, "onSubmit")({ preventDefault() {} });
    handler(close, "onClick")();
    assert.equal(uploadCalls.length, 1, "same-tick upload calls are exclusive");
    assert.equal(applicationCalls.length, 0, "application cannot snapshot unfinished uploads");
    assert.equal(closed, 0, "pending upload keeps the dialog open");
    await prematureSubmit;
    if (mode === "unmount") {
      for (const cleanup of effectCleanups) cleanup?.();
      firstUpload.resolve(record("file-first", "first.txt"));
      await turn();
      assert.deepEqual(uploadCalls, ["first.txt"], "unmounted dialog must not send the remaining proof files");
      assert.deepEqual(states[1].value, [], "late uploaded IDs are not written into an obsolete dialog");
      assert.equal(applicationCalls.length, 0);
      assert.equal(submitted, 0);
      return;
    }
    firstUpload.resolve(record("file-first", "first.txt"));
    await turn();
    assert.deepEqual(uploadCalls, ["first.txt", "second.txt"]);
    assert.deepEqual((states[1].value as Array<{ id: string }>).map((item) => item.id), ["file-first"], "first upload is retained when the second fails");
    tree = render();
    const status = tree.find((element) => element.type === "fixture-status");
    assert(status, "partial upload has an explicit failed-file retry");
    const tasks = status.props.tasks as Array<{ key: string; stage: string }>;
    const failed = tasks.find((task) => task.stage === "failed");
    assert(failed);
    handler(status, "onRetry")(failed.key);
    await turn();
    assert.deepEqual(uploadCalls, ["first.txt", "second.txt", "second.txt"], "retry skips already uploaded files");
    const ids = ["file-first", "file-second"];
    assert.deepEqual((states[1].value as Array<{ id: string }>).map((item) => item.id), ids);
    tree = render();
    const textarea = tree.find((element) => element.type === "textarea")!;
    handler(textarea, "onChange")({ target: { value: "Proof stays available after failure" } });
    tree = render();
    const submit = handler(tree.find((element) => element.type === "form")!, "onSubmit");
    const operation = submit({ preventDefault() {} });
    await submit({ preventDefault() {} });
    assert.equal(applicationCalls.length, 1, "same-tick application writes are exclusive");
    assert.equal(render().find((element) => element.type === "fieldset")?.props.disabled, true);
    handler(render().find((element) => element.type === "button" && element.props.children === "common.close")!, "onClick")();
    assert.equal(closed, 0);
    pendingApplications.shift()!.reject(new Error("Synthetic application unavailable"));
    await operation;
    assert.equal(render().find((element) => element.type === "textarea")?.props.value, "Proof stays available after failure");
    const retry = handler(render().find((element) => element.type === "form")!, "onSubmit");
    const resumed = retry({ preventDefault() {} });
    assert.equal(applicationCalls.length, 2);
    const body = JSON.parse(applicationCalls[1].body) as { attachmentIds?: string[]; proofFileIds?: string[] };
    assert.deepEqual(body.attachmentIds ?? body.proofFileIds, ids);
    assert.equal(uploadCalls.length, 3, "application retry reuses persisted attachment IDs");
    pendingApplications.shift()!.resolve({ status: "pending" });
    await resumed;
    await retry({ preventDefault() {} });
    assert.equal(applicationCalls.length, 2, "successful application cannot be submitted twice");
    assert.equal(submitted, kind === "creator" ? 1 : 0);
  } finally {
    firstUpload.resolve(record("file-first", "first.txt"));
    for (const pending of pendingApplications) pending.resolve({ status: "pending" });
    Reflect.deleteProperty(globalThis, key);
  }
});
