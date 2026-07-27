import type { OSSDirectUploadTicket } from "./oss-upload";

export type PersistedModExportUploadTask = {
  key: string;
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

export function modExportUploadTaskKey(siteId: string, targetVersionId: string, token: string) {
  return `exporter:${tokenSubject(token)}:${siteId}:${targetVersionId}`;
}

export async function createPersistedModExportUploadTask(
  task: PersistedModExportUploadTask,
  file: File,
) {
  await requestPersistentBrowserStorage();
  const database = await openUploadDatabase();
  await transactionPromise(database, "readwrite", [taskStore, fileStore], (transaction) => {
    transaction.objectStore(taskStore).put(task);
    transaction.objectStore(fileStore).put({ key: task.key, file } satisfies PersistedModExportUploadFile);
  });
}

export async function readPersistedModExportUploadTask(key: string) {
  const database = await openUploadDatabase();
  const transaction = database.transaction([taskStore, fileStore], "readonly");
  const taskRequest = transaction.objectStore(taskStore).get(key);
  const fileRequest = transaction.objectStore(fileStore).get(key);
  const [task, fileRecord] = await Promise.all([
    requestPromise<PersistedModExportUploadTask | undefined>(taskRequest),
    requestPromise<PersistedModExportUploadFile | undefined>(fileRequest),
    transactionCompletion(transaction),
  ]);
  if (!task || !fileRecord?.file) return undefined;
  return { task, file: fileRecord.file };
}

export async function updatePersistedModExportUploadTask(
  key: string,
  patch: Partial<Omit<PersistedModExportUploadTask, "key" | "siteId" | "targetVersionId" | "createdAt">>,
) {
  const database = await openUploadDatabase();
  const transaction = database.transaction(taskStore, "readwrite");
  const completion = transactionCompletion(transaction);
  const store = transaction.objectStore(taskStore);
  const current = await requestPromise<PersistedModExportUploadTask | undefined>(store.get(key));
  if (current) store.put({ ...current, ...patch, updatedAt: Date.now() });
  await completion;
}

export async function deletePersistedModExportUploadTask(key: string) {
  const database = await openUploadDatabase();
  await transactionPromise(database, "readwrite", [taskStore, fileStore], (transaction) => {
    transaction.objectStore(taskStore).delete(key);
    transaction.objectStore(fileStore).delete(key);
  });
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

function tokenSubject(token: string) {
  try {
    const payload = token.split(".")[1] || "";
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const value = JSON.parse(atob(normalized)) as { sub?: string | number };
    return String(value.sub || "session").replaceAll(/[^A-Za-z0-9_-]/g, "_");
  } catch {
    return "session";
  }
}

async function requestPersistentBrowserStorage() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // IndexedDB remains usable when the browser cannot grant durable storage.
  }
}
