import assert from "node:assert/strict";
import test from "node:test";
import { combineCatalogFiles } from "./combine-catalog-files.mts";

const message = (key: string, values?: Record<string, string | number>) => [key, ...Object.values(values || {})].join(" ");
const combine = (files: File[], signal = new AbortController().signal) => combineCatalogFiles(files, "iconrenderer", "IconRenderer", message, signal);

test("mixed JSON arrays and JSON lines retain exact order and UTF-8 values across empty files", async () => {
  const result = await combine([
    new File(["\ufeff[ { \"name\": \"矿石\" }, 0 ]"], "a.json"),
    new File(["[]"], "empty.json"),
    new File([" \n"], "blank.json"),
    new File(['null\r\n {"nested": [0, false]} \r\n'], "b.json"),
  ]);
  assert.equal(await result.text(), '{"name":"矿石"}\n0\nnull\n{"nested":[0,false]}');
  assert.equal(result.type, "application/x-ndjson");
});

test("JSONL errors report the physical line including leading whitespace", async () => {
  await assert.rejects(combine([new File([" \r\n\n{}\r\ninvalid\r\n"], "input.jsonl")]), /invalidLine input.jsonl 4$/);
});

test("invalid input fails with its filename and line and never returns a partial catalog", async () => {
  await assert.rejects(combine([new File(['{"ok":true}\nwrong'], "bad.json")]), /invalidLine bad.json 2/);
  await assert.rejects(combine([new File(["[]"], "empty.json")]), /catalogImport.empty/);
  await assert.rejects(combine(Array.from({ length: 9 }, () => new File(["[]"], "empty.json"))), /tooManyFiles/);
});

test("cancellation during a local file read stops before parsing or opening the next file", async () => {
  const controller = new AbortController();
  const first = new File([], "start.json");
  first.text = async () => { controller.abort(); return "Incomplete JSON"; };
  const next = new File([], "next.json");
  let nextReads = 0;
  next.text = async () => { nextReads++; return "[]"; };
  await assert.rejects(combine([first, next], controller.signal), { name: "AbortError" });
  assert.equal(nextReads, 0);
});
