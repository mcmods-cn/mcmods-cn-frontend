import test from "node:test";
import assert from "node:assert/strict";
import { initialCreatorAvatarReferences, restoredCreatorAvatarReference, uploadedCreatorAvatarReference } from "./creator-avatar-references.mts";

test("OSS-001 a signed initial presentation stays separate from the stored avatar and canonical file identity", () => {
  assert.deepEqual(initialCreatorAvatarReferences({ creator: { avatarUrl: "https://private.example/avatar.png?x-oss-signature=temporary" }, avatarStorageUrl: "https://private.example/avatar.png", avatarFileId: "avatar001" }), {
    previewUrl: "https://private.example/avatar.png?x-oss-signature=temporary", stableUrl: "https://private.example/avatar.png", fileId: "avatar001",
  });
});
test("OSS-001 a current legacy avatar without a file identity retains its explicit stored reference", () => {
  assert.deepEqual(initialCreatorAvatarReferences({ creator: { avatarUrl: "https://private.example/legacy.png?x-oss-signature=temporary" }, avatarStorageUrl: "https://private.example/legacy.png" }), {
    previewUrl: "https://private.example/legacy.png?x-oss-signature=temporary", stableUrl: "https://private.example/legacy.png", fileId: undefined,
  });
});
test("OSS-001 an older server with a file identity cannot cause its signed display URL to enter a new draft", () => {
  const value = initialCreatorAvatarReferences({ creator: { avatarUrl: "https://private.example/avatar.png?Signature=temporary" }, avatarFileId: "avatar001" });
  assert.equal(value.stableUrl, "");
  assert.equal(value.fileId, "avatar001");
  assert.match(value.previewUrl, /Signature=/);
});
test("OSS-001 restoring an old signed draft retains the file identity and prefers the current explicit stable reference", () => {
  assert.equal(restoredCreatorAvatarReference({ avatarUrl: "https://private.example/avatar.png?x-oss-signature=old", avatarFileId: "avatar001" }, { creator: { avatarUrl: "https://private.example/avatar.png?x-oss-signature=current" }, avatarStorageUrl: "https://private.example/avatar.png", avatarFileId: "avatar001" }), "https://private.example/avatar.png");
  assert.equal(restoredCreatorAvatarReference({ avatarUrl: "https://private.example/other.png?x-oss-signature=old", avatarFileId: "other0001" }, { creator: { avatarUrl: "" }, avatarFileId: "avatar001" }), "");
});
test("OSS-001 legitimate stable query parameters and immutable object keys survive avatar handling", () => {
  const stable = "https://images.example/avatar.png?size=256";
  assert.equal(initialCreatorAvatarReferences({ creator: { avatarUrl: stable } }).stableUrl, stable);
  assert.equal(restoredCreatorAvatarReference({ avatarUrl: stable }, null), stable);
  assert.equal(uploadedCreatorAvatarReference({ storageUrl: stable, objectKey: "owned/avatar.png" }), stable);
  assert.equal(uploadedCreatorAvatarReference({ storageUrl: "https://private.example/avatar.png?x-oss-signature=bad-contract", objectKey: "owned/avatar.png" }), "owned/avatar.png");
});

test("OSS-001 even an explicit stored field containing a known signature cannot enter a future draft", () => {
  const result = initialCreatorAvatarReferences({ creator: { avatarUrl: "https://private.example/avatar.png?x-oss-signature=preview" }, avatarStorageUrl: "https://private.example/avatar.png?x-oss-signature=legacy", avatarFileId: "avatar001" });
  assert.equal(result.stableUrl, "");
  assert.equal(result.previewUrl, "https://private.example/avatar.png?x-oss-signature=preview");
  assert.equal(result.fileId, "avatar001");
  assert.equal(result.needsVerification, true);
});

test("OSS-001 restoring a signed legacy draft cannot copy a signed explicit stored field", () => {
  assert.equal(restoredCreatorAvatarReference({ avatarUrl: "https://private.example/avatar.png?Signature=old", avatarFileId: "avatar001" }, { creator: { avatarUrl: "https://private.example/avatar.png?Signature=preview" }, avatarStorageUrl: "https://private.example/avatar.png?Signature=legacy", avatarFileId: "avatar001" }), "");
});
