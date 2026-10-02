export async function processEvidenceUploadBatch<TFile, TResult>(
  files: readonly TFile[],
  uploadOne: (file: TFile) => Promise<TResult>,
  onSuccess: (result: TResult, file: TFile) => void,
  onFailure: (file: TFile, error: unknown) => void,
) {
  const successes: TResult[] = [];
  const failures: Array<{ error: unknown; file: TFile }> = [];
  for (const file of files) {
    let result: TResult;
    try {
      result = await uploadOne(file);
    } catch (error) {
      failures.push({ error, file });
      onFailure(file, error);
      continue;
    }
    successes.push(result);
    onSuccess(result, file);
  }
  return { failures, successes };
}
