export async function processEvidenceUploadBatch<TFile, TResult>(
  files: readonly TFile[],
  uploadOne: (file: TFile) => Promise<TResult>,
  onSuccess: (result: TResult, file: TFile) => void,
  onFailure: (file: TFile, error: unknown) => void,
  signal?: AbortSignal,
) {
  const successes: TResult[] = [];
  const failures: Array<{ error: unknown; file: TFile }> = [];
  for (const file of files) {
    if (signal?.aborted) break;
    let result: TResult;
    try {
      result = await uploadOne(file);
    } catch (error) {
      if (signal?.aborted) break;
      failures.push({ error, file });
      onFailure(file, error);
      continue;
    }
    if (signal?.aborted) break;
    successes.push(result);
    onSuccess(result, file);
  }
  return { failures, successes };
}
