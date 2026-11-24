import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

function inlineModule(source: string) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function loadUploadModule(apiModule: string) {
  const source = (await readFile(new URL("./oss-upload.ts", import.meta.url), "utf8"))
    .replaceAll('"./api"', JSON.stringify(inlineModule(apiModule)))
    .replaceAll('"./api-error.mts"', JSON.stringify(new URL("./api-error.mts", import.meta.url).href))
    .replaceAll('"./oss-file-hash"', JSON.stringify(inlineModule('export function computeFileSHA256(){throw Error("Unexpected hash")}')));
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(inlineModule(compiled));
}

test("an already-cancelled multipart upload does not send file bytes", async () => {
  const { putFileToOSS } = await loadUploadModule('export function apiRequest(){throw Error("Unexpected API call")}');
  const previousWindow = Reflect.get(globalThis, "window");
  const previousXHR = Reflect.get(globalThis, "XMLHttpRequest");
  const sentSizes: number[] = [];
  // Keep transport local while observing any attempt to hand bytes to XHR.
  class FakeXHR {
    status = 200;
    upload = {};
    onload?: () => void;
    open() {}
    setRequestHeader() {}
    send(body: Blob) {
      sentSizes.push(body.size);
      queueMicrotask(() => this.onload?.());
    }
  }
  Reflect.set(globalThis, "window", { setTimeout, clearTimeout });
  Reflect.set(globalThis, "XMLHttpRequest", FakeXHR);
  try {
    const controller = new AbortController();
    controller.abort();
    const ticket = { multipart: {
      uploadId: "fixture",
      partSize: 1,
      parts: [1, 2].map((partNumber) => ({
        partNumber,
        sizeBytes: 1,
        method: "PUT",
        url: "https://storage.example.test/object",
      })),
    } };
    const result = await putFileToOSS(ticket, new File(["ab"], "fixture.bin"), undefined, { signal: controller.signal })
      .then(() => undefined, (error: unknown) => error);
    assert.deepEqual(sentSizes, []);
    assert(result instanceof DOMException && result.name === "AbortError");
  } finally {
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Reflect.set(globalThis, "window", previousWindow);
    if (previousXHR === undefined) Reflect.deleteProperty(globalThis, "XMLHttpRequest");
    else Reflect.set(globalThis, "XMLHttpRequest", previousXHR);
  }
});

test("cancelling export confirmation prevents retries after a failed response", async (t) => {
  const controller = new AbortController();
  const calls: RequestInit[] = [];
  const previousWindow = Reflect.get(globalThis, "window");
  t.after(() => {
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Reflect.set(globalThis, "window", previousWindow);
    Reflect.deleteProperty(globalThis, "mcmodsTestConfirmUpload");
  });
  Reflect.set(globalThis, "window", { setTimeout, clearTimeout });
  Reflect.set(globalThis, "mcmodsTestConfirmUpload", async (_path: string, init: RequestInit) => {
    calls.push(init);
    controller.abort();
    throw new TypeError("connection lost");
  });
  const { completeOSSUpload } = await loadUploadModule('export const apiRequest = (...args) => globalThis.mcmodsTestConfirmUpload(...args);');
  await assert.rejects(completeOSSUpload("/complete", { objectKey: "fixture" }, "cookie-session", controller.signal), { name: "AbortError" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal, controller.signal);
});

test("completion retries a temporary gateway failure and returns permanent API errors immediately", async (t) => {
  const previousWindow = Reflect.get(globalThis, "window");
  t.after(() => {
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Reflect.set(globalThis, "window", previousWindow);
    Reflect.deleteProperty(globalThis, "mcmodsTestConfirmUpload");
  });
  Reflect.set(globalThis, "window", { setTimeout: (fn: () => void) => setTimeout(fn, 0), clearTimeout });
  const apiErrorURL = new URL("./api-error.mts", import.meta.url).href;
  const { ApiError } = await import(apiErrorURL);
  const { completeOSSUpload } = await loadUploadModule('export const apiRequest = (...args) => globalThis.mcmodsTestConfirmUpload(...args);');
  const ticket = { objectKey: "fixture" };
  const received: string[] = [];
  const denied = new ApiError("not available for this account", 403);
  Reflect.set(globalThis, "mcmodsTestConfirmUpload", async (_path: string, init: RequestInit) => {
    received.push(String(init.body));
    if (received.length === 1) throw new ApiError("unavailable", 503);
    throw denied;
  });
  await assert.rejects(completeOSSUpload("/complete", ticket, "cookie-session"), (error: unknown) => error === denied);
  assert.equal(received.length, 2);
  assert.equal(received[0], received[1]);
});
