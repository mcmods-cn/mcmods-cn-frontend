import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { withStickerUploadLifecycle } from "./sticker-upload-lifecycle.mts";

test("a failed sticker mutation discards its completed upload and preserves the mutation error", async () => {
  const mutationError = new Error("duplicate sticker code");
  const discarded: string[] = [];
  await assert.rejects(
    withStickerUploadLifecycle(
      async () => "file-1",
      async () => { throw mutationError; },
      async (fileID) => { discarded.push(fileID); },
    ),
    (error) => error === mutationError,
  );
  assert.deepEqual(discarded, ["file-1"]);
});

test("successful mutations and upload failures do not issue a discard for an unowned file", async () => {
  let discards = 0;
  assert.equal(await withStickerUploadLifecycle(async () => "file-2", async (id) => id, async () => { discards += 1; }), "file-2");
  await assert.rejects(withStickerUploadLifecycle(async () => { throw new Error("upload failed"); }, async () => undefined, async () => { discards += 1; }));
  assert.equal(discards, 0);
});

test("cleanup failure does not hide the original mutation failure", async () => {
  const original = new Error("mutation failed");
  await assert.rejects(
    withStickerUploadLifecycle(async () => "file-3", async () => { throw original; }, async () => { throw new Error("cleanup failed"); }),
    (error) => error === original,
  );
});

test("create and replacement use unique temporary sources and the shared lifecycle", async () => {
  const source = await readFile(new URL("../_components/admin-sticker-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /`sticker-upload:\$\{crypto\.randomUUID\(\)\}`/);
  assert.equal(source.match(/withStickerUploadLifecycle\(/g)?.length, 2);
  assert.match(source, /sticker-upload-files\/\$\{encodeURIComponent\(fileID\)\}/);
});
