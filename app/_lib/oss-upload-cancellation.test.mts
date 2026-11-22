import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

function inlineModule(source: string) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

test("an already-cancelled multipart upload does not send file bytes", async () => {
  const source = (await readFile(new URL("./oss-upload.ts", import.meta.url), "utf8"))
    .replaceAll('"./api"', JSON.stringify(inlineModule('export function apiRequest(){throw Error("Unexpected API call")}')))
    .replaceAll('"./oss-file-hash"', JSON.stringify(inlineModule('export function computeFileSHA256(){throw Error("Unexpected hash")}')));
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { putFileToOSS } = await import(inlineModule(compiled));
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
