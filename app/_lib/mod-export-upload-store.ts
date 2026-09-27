import type { OSSDirectUploadTicket } from "./oss-upload";

export type PersistedModExportUploadTask = {
  key: string;
  subjectId: string;
  siteId: string;
  targetVersionId: string;
  overwriteExistingImportData: boolean;
  phase: "uploading" | "importing";
  ticket?: OSSDirectUploadTicket;
  completedPartNumbers: number[];
  jobId?: string;
  createdAt: number;
  updatedAt: number;
};

type PersistedModExportUploadFile = {
  key: string;
  file: File;
};

const databaseName = "mcmods-cn-import-uploads";
const taskStore = "tasks";
const fileStore = "files";

export function modExportUploadTaskKey(siteId: string, targetVersionId: string, subjectId: string) {
  const normalizedSubjectId = normalizeSubjectId(subjectId);
  return `exporter:${normalizedSubjectId}:${siteId}:${targetVersionId}`;
}

export function persistedModExportUploadTaskBelongsToSubject(
  task: PersistedModExportUploadTask,
  subjectId: string,
) {
  let normalizedSubjectId: string;
  try {
    normalizedSubjectId = normalizeSubjectId(subjectId);
  } catch {
    return false;
  }
  return task.subjectId === normalizedSubjectId &&
    task.key === modExportUploadTaskKey(task.siteId, task.targetVersionId, normalizedSubjectId);
}

export async function createPersistedModExportUploadTask(
  task: PersistedModExportUploadTask,
  file: File,
) {
  if (!persistedModExportUploadTaskBelongsToSubject(task, task.subjectId)) {
    throw new Error("The upload task is not bound to a valid user public ID.");
  }
  await requestPersistentBrowserStorage();
  const database = await openUploadDatabase();
  await transactionPromise(database, "readwrite", [taskStore, fileStore], (transaction) => {
    transaction.objectStore(taskStore).put(task);
    transaction.objectStore(fileStore).put({ key: task.key, file } satisfies PersistedModExportUploadFile);
  });
}

export async function readPersistedModExportUploadTask(key: string, subjectId: string) {
  const database = await openUploadDatabase();
  const transaction = database.transaction([taskStore, fileStore], "readonly");
  const taskRequest = transaction.objectStore(taskStore).get(key);
  const fileRequest = transaction.objectStore(fileStore).get(key);
  const [task, fileRecord] = await Promise.all([
    requestPromise<PersistedModExportUploadTask | undefined>(taskRequest),
    requestPromise<PersistedModExportUploadFile | undefined>(fileRequest),
    transactionCompletion(transaction),
  ]);
  if (!task || !fileRecord?.file || !persistedModExportUploadTaskBelongsToSubject(task, subjectId)) return undefined;
  return { task, file: fileRecord.file };
}

export async function updatePersistedModExportUploadTask(
  key: string,
  subjectId: string,
  patch: Partial<Omit<PersistedModExportUploadTask, "key" | "subjectId" | "siteId" | "targetVersionId" | "createdAt">>,
) {
  const database = await openUploadDatabase();
  const transaction = database.transaction(taskStore, "readwrite");
  const completion = transactionCompletion(transaction);
  const store = transaction.objectStore(taskStore);
  const current = await requestPromise<PersistedModExportUploadTask | undefined>(store.get(key));
  if (current && persistedModExportUploadTaskBelongsToSubject(current, subjectId)) {
    store.put({ ...current, ...patch, subjectId: current.subjectId, updatedAt: Date.now() });
  }
  await completion;
}

export async function deletePersistedModExportUploadTask(key: string, subjectId: string) {
  const database = await openUploadDatabase();
  const transaction = database.transaction([taskStore, fileStore], "readwrite");
  const completion = transactionCompletion(transaction);
  const taskStoreHandle = transaction.objectStore(taskStore);
  const current = await requestPromise<PersistedModExportUploadTask | undefined>(taskStoreHandle.get(key));
  if (current && persistedModExportUploadTaskBelongsToSubject(current, subjectId)) {
    taskStoreHandle.delete(key);
    transaction.objectStore(fileStore).delete(key);
  }
  await completion;
}

function openUploadDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(taskStore)) {
        database.createObjectStore(taskStore, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(fileStore)) {
        database.createObjectStore(fileStore, { keyPath: "key" });
      }
    };
    request.onerror = () => reject(request.error || new Error("Failed to open the upload task database."));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error("Upload task storage request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionCompletion(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error || new Error("Upload task storage transaction was aborted."));
    transaction.onerror = () => reject(transaction.error || new Error("Upload task storage transaction failed."));
    transaction.oncomplete = () => resolve();
  });
}

async function transactionPromise(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  stores: string[],
  action: (transaction: IDBTransaction) => void,
) {
  const transaction = database.transaction(stores, mode);
  action(transaction);
  await transactionCompletion(transaction);
}

function normalizeSubjectId(subjectId: string) {
  const normalized = subjectId.trim().toLowerCase();
  if (!/^[a-z0-9]{9}$/.test(normalized)) {
    throw new Error("A valid authenticated user public ID is required for upload recovery.");
  }
  return normalized;
}

async function requestPersistentBrowserStorage() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // IndexedDB remains usable when the browser cannot grant durable storage.
  }
}
