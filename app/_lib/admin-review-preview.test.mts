import assert from "node:assert/strict";
import test from "node:test";
import { parseRevisionPreview } from "./admin-review-preview.mts";

const envelope = () => ({ id: "oct02rev1", projectId: "oct02prj1", entityType: "project_changelog", status: "pending", snapshot: { eventAt: "2026-10-02T00:00:00Z", minecraftVersions: ["1.21"], projectVersion: "1.0", defaultLocale: "en-US", localizations: [{ locale: "en-US", bodyMarkdown: '<script>alert("inert")</script>' }] } });
test("review previews accept the typed pending proposal and preserve untrusted text as text", () => {
  const value = envelope();
  assert.deepEqual(parseRevisionPreview(value, value.id), value);
});
test("review previews reject wrong identities, states, types and unexpected sensitive fields", () => {
  for (const patch of [{ id: "oct02rev2" }, { projectId: 123 }, { projectId: "invalid" }, { status: "approved" }, { entityType: "user" }, { accessKeySecret: "synthetic forbidden field" }]) {
    assert.throws(() => parseRevisionPreview({ ...envelope(), ...patch }, "oct02rev1"));
  }
});
test("review previews reject malformed or unexpected nested snapshots", () => {
  for (const snapshot of [null, [], {}, { ...envelope().snapshot, localizations: [{ locale: "en-US", bodyMarkdown: "ok", secret: "synthetic" }] }, { ...envelope().snapshot, minecraftVersions: "1.21" }, { ...envelope().snapshot, eventAt: "invalid" }]) {
    assert.throws(() => parseRevisionPreview({ ...envelope(), snapshot }, "oct02rev1"));
  }
});
