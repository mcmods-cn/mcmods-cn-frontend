export type PollingDelay = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

export async function waitForPolledJob<T extends { status: string }>(
  load: (signal?: AbortSignal) => Promise<T>,
  terminalStatuses: ReadonlySet<string>,
  onProgress: (job: T) => void,
  signal?: AbortSignal,
  delay: PollingDelay = abortablePollingDelay,
  intervalMilliseconds = 1200,
) {
  for (;;) {
    if (signal?.aborted) throw new DOMException("Polling aborted", "AbortError");
    const job = await load(signal);
    onProgress(job);
    if (terminalStatuses.has(job.status)) return job;
    await delay(intervalMilliseconds, signal);
  }
}

function abortablePollingDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException("Polling aborted", "AbortError"));
    }, { once: true });
  });
}
