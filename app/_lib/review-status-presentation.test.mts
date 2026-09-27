import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveReviewStatusPresentation } from "./review-status-presentation.mts";

test("every supported review status resolves to a dedicated translation key", () => {
  for (const status of ["draft", "pending", "approved", "rejected"] as const) {
    assert.deepEqual(resolveReviewStatusPresentation(status), {
      status,
      translationKey: `reviewStatuses.${status}`,
    });
  }
});

test("unknown review states fail visibly as protocol errors", () => {
  for (const status of ["", "withdrawn", "APPROVED", null, 42]) {
    assert.deepEqual(resolveReviewStatusPresentation(status), {
      translationKey: "reviewStatuses.protocolError",
    });
  }
});

test("generic review components do not use action copy as status copy", async () => {
  const [panel, badge, en, zh] = await Promise.all([
    readFile(new URL("../_components/editor/review-status-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_components/editor/localization-status-badge.tsx", import.meta.url), "utf8"),
    readFile(new URL("../_locales/en-US.ts", import.meta.url), "utf8"),
    readFile(new URL("../_locales/zh-CN.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [panel, badge]) {
    assert.match(source, /resolveReviewStatusPresentation/);
    assert.doesNotMatch(source, /labels\.(draft|pending|approved|rejected) \?\? t\("common\.(edit|loading|confirm|cancel)"\)/);
  }
  for (const dictionary of [en, zh]) {
    assert.match(dictionary, /reviewStatuses:\s*\{/);
    for (const key of ["draft", "pending", "approved", "rejected", "protocolError"]) {
      assert.match(dictionary, new RegExp(`${key}:`));
    }
  }
});
