export type CreatorAvatarDetail = {
  creator: { avatarUrl: string };
  avatarStorageUrl?: string;
  avatarFileId?: string;
};

export function temporaryAvatarAccessURL(value: string) {
  try {
    const url = new URL(value);
    return [...url.searchParams.keys()].some((key) => ["x-oss-signature", "x-amz-signature", "signature"].includes(key.toLowerCase()));
  } catch {
    return false;
  }
}

// The detail's presentation URL may be a private temporary capability. An
// explicit stored reference or a canonical public file identity is durable.
export function initialCreatorAvatarReferences(detail: CreatorAvatarDetail | null) {
  const previewUrl = detail?.creator.avatarUrl || "";
  const stableUrl = detail?.avatarStorageUrl ?? (detail?.avatarFileId || temporaryAvatarAccessURL(previewUrl) ? "" : previewUrl);
  return { stableUrl, previewUrl, fileId: detail?.avatarFileId };
}

export function restoredCreatorAvatarReference(value: { avatarUrl?: string; avatarFileId?: string }, detail: CreatorAvatarDetail | null) {
  const candidate = value.avatarUrl || "";
  if (!temporaryAvatarAccessURL(candidate)) return candidate;
  if ((value.avatarFileId || "") === (detail?.avatarFileId || "")) return detail?.avatarStorageUrl || "";
  // The file identity remains in the draft and is re-authorized on preview and
  // submission. Do not perpetuate an old temporary URL just to retain it.
  return "";
}

export function uploadedCreatorAvatarReference(value: { storageUrl?: string; objectKey: string }) {
  if (value.storageUrl && !temporaryAvatarAccessURL(value.storageUrl)) return value.storageUrl;
  return value.objectKey;
}
