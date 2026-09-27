export async function withStickerUploadLifecycle<T>(
  upload: () => Promise<string>,
  mutate: (fileID: string) => Promise<T>,
  discard: (fileID: string) => Promise<void>,
) {
  const fileID = await upload();
  try {
    return await mutate(fileID);
  } catch (error) {
    try {
      await discard(fileID);
    } catch {
      // The backend expiration worker is the durable fallback for a failed
      // best-effort discard. Preserve the mutation error for the operator.
    }
    throw error;
  }
}
