export type OSSUploadBatchStage = "pending" | "invalid" | "uploading" | "uploaded" | "failed";

export type OSSUploadRecord = { id: string; [key: string]: unknown };

export type OSSUploadBatchTask<TFile, TResult extends OSSUploadRecord = OSSUploadRecord> = {
  error: string;
  file: TFile;
  key: string;
  name: string;
  result?: TResult;
  stage: OSSUploadBatchStage;
  uploadedFileId: string;
};

export type CreateOSSUploadBatchOptions<TFile> = {
  capacity: number;
  capacityError: string;
  identity: (file: TFile, index: number) => string;
  validate: (file: TFile, index: number) => string;
};

export type ProcessOSSUploadBatchOptions<TFile, TResult extends OSSUploadRecord> = {
  onChange?: (tasks: OSSUploadBatchTask<TFile, TResult>[]) => void;
  onUploaded?: (task: OSSUploadBatchTask<TFile, TResult>, result: TResult) => void;
  shouldProcess?: (task: OSSUploadBatchTask<TFile, TResult>) => boolean;
  upload: (file: TFile, task: OSSUploadBatchTask<TFile, TResult>) => Promise<TResult>;
};

export function createOSSUploadBatchTasks<TFile extends { name: string }, TResult extends OSSUploadRecord = OSSUploadRecord>(
  files: TFile[],
  options: CreateOSSUploadBatchOptions<TFile>,
): OSSUploadBatchTask<TFile, TResult>[] {
  let accepted = 0;
  return files.map((file, index) => {
    const validationError = options.validate(file, index);
    const capacityError = !validationError && accepted >= Math.max(0, options.capacity)
      ? options.capacityError
      : "";
    if (!validationError && !capacityError) accepted += 1;
    return {
      error: validationError || capacityError,
      file,
      key: options.identity(file, index),
      name: file.name,
      stage: validationError || capacityError ? "invalid" : "pending",
      uploadedFileId: "",
    };
  });
}

export async function processOSSUploadBatch<TFile extends { name: string }, TResult extends OSSUploadRecord>(
  tasks: OSSUploadBatchTask<TFile>[],
  options: ProcessOSSUploadBatchOptions<TFile, TResult>,
): Promise<OSSUploadBatchTask<TFile, TResult>[]> {
  const current = tasks.map((task) => ({ ...task, result: task.result as TResult | undefined }));
  const snapshot = () => current.map((task) => ({ ...task }));
  const publish = () => options.onChange?.(snapshot());
  const update = (index: number, patch: Partial<OSSUploadBatchTask<TFile, TResult>>) => {
    current[index] = { ...current[index], ...patch };
    publish();
  };

  // Every deterministic local rejection is already represented in this first
  // snapshot, before an OSS request can create a billable user file.
  publish();
  for (let index = 0; index < current.length; index += 1) {
    const task = current[index];
    if (task.stage === "invalid" || task.stage === "uploaded" || task.uploadedFileId) continue;
    if (options.shouldProcess && !options.shouldProcess(task)) continue;
    update(index, { error: "", stage: "uploading" });
    try {
      const result = await options.upload(task.file, task);
      const uploadedFileId = result.id?.trim();
      if (!uploadedFileId) throw new Error("OSS upload response is missing a file ID");
      update(index, { error: "", result, stage: "uploaded", uploadedFileId });
      options.onUploaded?.({ ...current[index] }, result);
    } catch (error) {
      update(index, { error: errorText(error), result: undefined, stage: "failed", uploadedFileId: "" });
    }
  }
  return snapshot();
}

export function hasUnfinishedOSSUploadTasks(tasks: Array<Pick<OSSUploadBatchTask<unknown>, "stage">>) {
  return tasks.some((task) => task.stage === "pending" || task.stage === "uploading" || task.stage === "failed");
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
