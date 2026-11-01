export type CreatorAvatarDetail = {
  creator: { avatarUrl: string };
  avatarStorageUrl?: string;
  avatarFileId?: string;
  avatarReferenceNeedsVerification?: boolean;
};

export function temporaryAvatarAccessURL(value: string) {
  try {
    const url = new URL(value);
    return [...url.searchParams.keys()].some((key) => ["x-oss-signature", "x-amz-signature", "signature", "auth_key"].includes(key.toLowerCase()));
  } catch {
    return false;
  }
}

// The detail's presentation URL may be a private temporary capability. An
// explicit stored reference or a canonical public file identity is durable.
export function initialCreatorAvatarReferences(detail: CreatorAvatarDetail | null) {
  const previewUrl = detail?.creator.avatarUrl || "";
  const explicitTemporary = temporaryAvatarAccessURL(detail?.avatarStorageUrl || "");
  const needsVerification = Boolean(detail?.avatarReferenceNeedsVerification || explicitTemporary || (!detail?.avatarFileId && !detail?.avatarStorageUrl && temporaryAvatarAccessURL(previewUrl)));
  const stableUrl = needsVerification ? "" : detail?.avatarStorageUrl ?? (detail?.avatarFileId || temporaryAvatarAccessURL(previewUrl) ? "" : previewUrl);
  return { stableUrl, previewUrl, fileId: detail?.avatarFileId, needsVerification };
}

export function restoredCreatorAvatarReference(value: { avatarUrl?: string; avatarFileId?: string }, detail: CreatorAvatarDetail | null) {
  const candidate = value.avatarUrl || "";
  if (!temporaryAvatarAccessURL(candidate)) return candidate;
  if ((value.avatarFileId || "") === (detail?.avatarFileId || "")) return initialCreatorAvatarReferences(detail).stableUrl;
  // The file identity remains in the draft and is re-authorized on preview and
  // submission. Do not perpetuate an old temporary URL just to retain it.
  return "";
}

export function restoredCreatorAvatarNeedsVerification(value: { avatarUrl?: string; avatarFileId?: string; avatarReferenceNeedsVerification?: boolean }, detail: CreatorAvatarDetail | null) {
  if (value.avatarReferenceNeedsVerification) return true;
  if ((value.avatarFileId || "") === (detail?.avatarFileId || "")) return initialCreatorAvatarReferences(detail).needsVerification || (!value.avatarFileId && temporaryAvatarAccessURL(value.avatarUrl || ""));
  // A different canonical file identity is re-authorized on refresh and write;
  // an unbound temporary URL is not a replacement-file identity.
  return !value.avatarFileId && temporaryAvatarAccessURL(value.avatarUrl || "");
}

export function uploadedCreatorAvatarReference(value: { storageUrl?: string; objectKey: string }) {
  if (value.storageUrl && !temporaryAvatarAccessURL(value.storageUrl)) return value.storageUrl;
  return value.objectKey;
}

const verificationMessages: Readonly<Record<string, string>> = {
  "zh-CN": "请重新选择头像，以便核验后保存。",
  "zh-TW": "請重新選擇頭像，以便核驗後儲存。",
  "en-US": "Select the avatar again so it can be verified before saving.",
  "ja-JP": "保存前に確認できるよう、アバターをもう一度選択してください。",
  "fr-FR": "Sélectionnez à nouveau l’avatar afin de le vérifier avant l’enregistrement.",
  "de-DE": "Wähle den Avatar erneut aus, damit er vor dem Speichern geprüft werden kann.",
  "es-ES": "Vuelve a seleccionar el avatar para verificarlo antes de guardar.",
  "ru-RU": "Выберите аватар ещё раз для проверки перед сохранением.",
};
export function creatorAvatarVerificationMessage(locale: string) {
  return verificationMessages[locale] || verificationMessages["en-US"];
}
