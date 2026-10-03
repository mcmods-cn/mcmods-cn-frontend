export type LogUploadStage = "pending" | "invalid" | "uploading" | "uploaded" | "creating" | "processing" | "ready" | "failed";

export type LogShareCreationResult = {
  fileId?: string;
  publicCode?: string;
  url?: string;
  status: string;
  expiresAt?: string;
  redactionVersion?: number;
  redactionCounts?: Record<string, number>;
  entryCount?: number;
  error?: string;
};

export type LogUploadTask<TFile> = {
  key: string;
  file: TFile;
  name: string;
  stage: LogUploadStage;
  uploadedFileId: string;
  error: string;
  share?: LogShareCreationResult;
};

export type LogUploadBatchOptions<TFile> = {
  upload: (file: TFile) => Promise<{ id: string }>;
  createShares: (fileIds: string[]) => Promise<{ items: LogShareCreationResult[] }>;
  onChange?: (tasks: LogUploadTask<TFile>[]) => void;
  messages?: {
    unsupportedFile: (name: string) => string;
    missingUploadID: string;
    missingResult: string;
    failed: string;
    invalidStatus: string;
  };
};

const supportedLogExtensions = [".zip", ".log", ".txt"];

export function createLogUploadTasks<TFile extends { name: string }>(
  files: TFile[],
  identity: (file: TFile) => string,
  limit: number,
) {
  return mergeLogUploadTasks<TFile>([], files, identity, limit);
}

export function mergeLogUploadTasks<TFile extends { name: string }>(
  current: LogUploadTask<TFile>[],
  selected: TFile[],
  identity: (file: TFile) => string,
  limit: number,
) {
  const tasks = new Map(current.map((task) => [task.key, task]));
  for (const file of selected) {
    const key = identity(file);
    if (!tasks.has(key)) {
      tasks.set(key, { key, file, name: file.name, stage: "pending", uploadedFileId: "", error: "" });
    }
  }
  return Array.from(tasks.values()).slice(0, limit);
}

export async function processLogUploadBatch<TFile extends { name: string }>(
  tasks: LogUploadTask<TFile>[],
  options: LogUploadBatchOptions<TFile>,
) {
  const current = tasks.map((task) => ({ ...task, share: task.share ? { ...task.share } : undefined }));
  const publish = () => options.onChange?.(current.map((task) => ({ ...task, share: task.share ? { ...task.share } : undefined })));
  const update = (index: number, patch: Partial<LogUploadTask<TFile>>) => {
    current[index] = { ...current[index], ...patch };
    publish();
  };

  for (let index = 0; index < current.length; index++) {
    const task = current[index];
    if (!isSupportedLogFile(task.name)) {
      current[index] = { ...task, stage: "invalid", error: options.messages?.unsupportedFile(task.name) ?? `${task.name}：不支持的文件类型`, share: undefined };
    } else if (task.stage === "invalid") {
      current[index] = { ...task, stage: "pending", error: "" };
    }
  }
  // Publish the complete local classification before any asynchronous upload
  // begins, so one invalid item can never be discovered after siblings upload.
  publish();

  for (let index = 0; index < current.length; index++) {
    const task = current[index];
    if (task.stage === "invalid" || task.stage === "ready" || task.uploadedFileId) continue;
    update(index, { stage: "uploading", error: "" });
    try {
      const uploaded = await options.upload(task.file);
      if (!uploaded.id?.trim()) throw new Error(options.messages?.missingUploadID ?? "上传成功响应缺少文件 ID");
      update(index, { stage: "uploaded", uploadedFileId: uploaded.id.trim(), error: "" });
    } catch (error) {
      update(index, { stage: "failed", error: errorText(error) });
    }
  }

  const candidates = current
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.stage !== "ready" && task.stage !== "invalid" && Boolean(task.uploadedFileId));
  if (!candidates.length) return current;
  for (const { index } of candidates) {
    current[index] = { ...current[index], stage: "creating", error: "" };
  }
  publish();

  let response: { items: LogShareCreationResult[] };
  try {
    response = await options.createShares(candidates.map(({ task }) => task.uploadedFileId));
  } catch (error) {
    const message = errorText(error);
    for (const { index } of candidates) {
      current[index] = { ...current[index], stage: "failed", error: message };
    }
    publish();
    return current;
  }

  const byFileID = new Map(response.items.map((item) => [item.fileId || "", item]));
  for (const { task, index } of candidates) {
    const item = byFileID.get(task.uploadedFileId);
    if (!item) {
      current[index] = { ...current[index], stage: "failed", error: options.messages?.missingResult ?? "日志创建响应缺少该文件的结果", share: undefined };
    } else if (item.error || item.status === "failed") {
      current[index] = { ...current[index], stage: "failed", error: item.error || options.messages?.failed || "日志处理失败", share: undefined };
    } else if (item.status === "processing") {
      current[index] = { ...current[index], stage: "processing", error: "", share: item };
    } else if (item.publicCode && item.status === "ready") {
      current[index] = { ...current[index], stage: "ready", error: "", share: item };
    } else {
      current[index] = { ...current[index], stage: "failed", error: options.messages?.invalidStatus ?? "日志创建响应状态不正确", share: undefined };
    }
  }
  publish();
  return current;
}

export function isSupportedLogFile(name: string) {
  const normalized = name.toLowerCase();
  return supportedLogExtensions.some((extension) => normalized.endsWith(extension));
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
