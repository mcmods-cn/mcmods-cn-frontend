import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  computeFileSHA256,
  OSS_HASH_CHUNK_BYTES,
  OSS_HASH_MAX_CONCURRENCY,
  OSS_HASH_MAX_FILE_BYTES,
} from "./oss-file-hash.ts";
import { IncrementalSHA256 } from "./oss-sha256-worker.mjs";

test("incremental SHA-256 matches standard vectors across arbitrary chunks", () => {
  const vectors = [
    { chunks: [new Uint8Array()], expected: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    { chunks: [new TextEncoder().encode("a"), new TextEncoder().encode("bc")], expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
    { chunks: Array.from({ length: 1000 }, () => new TextEncoder().encode("a".repeat(1000))), expected: "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0" },
  ];
  for (const vector of vectors) {
    const hasher = new IncrementalSHA256();
    for (const chunk of vector.chunks) hasher.update(chunk);
    assert.equal(hasher.digestHex(), vector.expected);
  }
});

test("large browser hashing reads one bounded slice at a time", async () => {
  const size = OSS_HASH_CHUNK_BYTES * 5 + 123;
  let slices = 0;
  let maximumSlice = 0;
  let activeReads = 0;
  let maximumActiveReads = 0;
  const virtualFile = {
    size,
    arrayBuffer() { throw new Error("whole-file arrayBuffer must not be called"); },
    slice(start: number, end: number) {
      const length = end - start;
      slices += 1;
      maximumSlice = Math.max(maximumSlice, length);
      return {
        async arrayBuffer() {
          activeReads += 1;
          maximumActiveReads = Math.max(maximumActiveReads, activeReads);
          await Promise.resolve();
          activeReads -= 1;
          return new ArrayBuffer(length);
        },
      };
    },
  };
  const expected = createHash("sha256");
  for (let offset = 0; offset < size; offset += OSS_HASH_CHUNK_BYTES) {
    expected.update(Buffer.alloc(Math.min(OSS_HASH_CHUNK_BYTES, size - offset)));
  }
  assert.equal(await computeFileSHA256(virtualFile as unknown as Blob), expected.digest("hex"));
  assert.equal(slices, 6);
  assert.ok(maximumSlice <= OSS_HASH_CHUNK_BYTES);
  assert.equal(maximumActiveReads, 1);
});

test("hashing is single-concurrency and queued work is abortable", async () => {
  assert.equal(OSS_HASH_MAX_CONCURRENCY, 1);
  let releaseFirst!: () => void;
  let firstSlices = 0;
  let secondSlices = 0;
  const first = {
    size: 1,
    slice() {
      firstSlices += 1;
      return { arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { releaseFirst = () => resolve(new Uint8Array([1]).buffer); }) };
    },
  };
  const second = {
    size: 1,
    slice() {
      secondSlices += 1;
      return { arrayBuffer: async () => new Uint8Array([2]).buffer };
    },
  };
  const firstHash = computeFileSHA256(first as unknown as Blob);
  await Promise.resolve();
  const secondHash = computeFileSHA256(second as unknown as Blob);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(firstSlices, 1);
  assert.equal(secondSlices, 0);
  releaseFirst();
  await Promise.all([firstHash, secondHash]);
  assert.equal(secondSlices, 1);

  const controller = new AbortController();
  const queued = computeFileSHA256(second as unknown as Blob, { signal: controller.signal });
  controller.abort();
  await assert.rejects(queued, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("active hashing observes cancellation between chunks and rejects oversized files before reading", async () => {
  const controller = new AbortController();
  let slices = 0;
  const file = {
    size: OSS_HASH_CHUNK_BYTES * 3,
    slice(start: number, end: number) {
      slices += 1;
      return { arrayBuffer: async () => new ArrayBuffer(end - start) };
    },
  };
  await assert.rejects(
    computeFileSHA256(file as unknown as Blob, {
      signal: controller.signal,
      onProgress() { controller.abort(); },
    }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(slices, 1);

  let oversizedRead = false;
  await assert.rejects(computeFileSHA256({
    size: OSS_HASH_MAX_FILE_BYTES + 1,
    slice() { oversizedRead = true; throw new Error("must not read"); },
  } as unknown as Blob), /size limit/i);
  assert.equal(oversizedRead, false);
});

test("production hashing uses a transferable worker and no whole-file materialization", () => {
  const boundary = readFileSync(new URL("./oss-file-hash.ts", import.meta.url), "utf8");
  const worker = readFileSync(new URL("./oss-sha256-worker.mjs", import.meta.url), "utf8");
  const upload = readFileSync(new URL("./oss-upload.ts", import.meta.url), "utf8");
  const modExport = readFileSync(new URL("./mod-export-api.ts", import.meta.url), "utf8");
  assert.match(boundary, /new Worker\(new URL\("\.\/oss-sha256-worker\.mjs"/);
  assert.match(boundary, /file\.slice\(offset, end\)\.arrayBuffer\(\)/);
  assert.match(boundary, /postMessage\([^;]+\[buffer\]/s);
  assert.match(worker, /new IncrementalSHA256\(\)/);
  assert.match(worker, /typeof WorkerGlobalScope !== "undefined"/);
  assert.doesNotMatch(worker, /^\s*import\s/m);
  assert.doesNotMatch(worker, /\b(?:interface|type)\s+[A-Z]/);
  assert.doesNotMatch(boundary + upload, /file\.arrayBuffer\(\)/);
  assert.match(modExport, /computeFileSHA256\(file, \{\s*signal: control\.signal/s);
});
