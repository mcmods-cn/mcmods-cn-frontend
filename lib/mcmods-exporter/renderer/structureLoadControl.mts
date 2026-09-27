type SharedEntry<Value> = {
  controller: AbortController;
  consumers: number;
  promise: Promise<Value>;
  settled: boolean;
};

type QueuedTask<Value = unknown> = {
  signal?: AbortSignal;
  task: () => Promise<Value> | Value;
  resolve: (value: Value) => void;
  reject: (reason: unknown) => void;
  aborted: boolean;
  onAbort?: () => void;
};

export function abortError(message = "Structure load was cancelled") {
  return new DOMException(message, "AbortError");
}

export function abortReason(signal: AbortSignal, message?: string): Error {
  if (signal.reason instanceof Error && signal.reason.name === "AbortError") return signal.reason;
  return abortError(message ?? (signal.reason instanceof Error ? signal.reason.message : undefined));
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

export function isAbortError(reason: unknown): boolean {
  return reason instanceof Error && reason.name === "AbortError";
}

export function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  const abort = () => target.abort(abortReason(source));
  if (source.aborted) abort();
  else source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

/**
 * Shares successful asset reads without letting one cancelled viewer poison other
 * consumers. The underlying request is aborted as soon as its last consumer leaves.
 */
export class AbortableSharedCache<Value> {
  private readonly entries = new Map<string, SharedEntry<Value>>();

  get(key: string, signal: AbortSignal | undefined, loader: (signal: AbortSignal) => Promise<Value>): Promise<Value> {
    throwIfAborted(signal);
    let entry = this.entries.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = {
        controller,
        consumers: 0,
        promise: Promise.resolve().then(() => loader(controller.signal)),
        settled: false,
      };
      this.entries.set(key, entry);
      const created = entry;
      created.promise.then(
        () => { created.settled = true; },
        () => {
          created.settled = true;
          if (this.entries.get(key) === created) this.entries.delete(key);
        },
      );
    }
    entry.consumers++;
    return this.consume(key, entry, signal);
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      if (!entry.settled) entry.controller.abort(abortError("Asset cache was cleared"));
    }
    this.entries.clear();
  }

  private consume(key: string, entry: SharedEntry<Value>, signal?: AbortSignal): Promise<Value> {
    return new Promise<Value>((resolve, reject) => {
      let finished = false;
      const release = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener("abort", onAbort);
        entry.consumers--;
        if (!entry.settled && entry.consumers === 0) {
          if (this.entries.get(key) === entry) this.entries.delete(key);
          entry.controller.abort(abortError("No active asset consumers remain"));
        }
        return true;
      };
      const onAbort = () => {
        if (release()) reject(abortReason(signal!, "Asset request was cancelled"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      entry.promise.then(
        (value) => { if (release()) resolve(value); },
        (reason) => { if (release()) reject(reason); },
      );
    });
  }
}

/** Serializes the non-interruptible parts of parsing and Three.js model creation. */
export class ExclusiveTaskGate {
  private active = false;
  private readonly queue: QueuedTask[] = [];

  run<Value>(signal: AbortSignal | undefined, task: () => Promise<Value> | Value): Promise<Value> {
    throwIfAborted(signal);
    return new Promise<Value>((resolve, reject) => {
      const queued: QueuedTask<Value> = {
        signal,
        task,
        resolve,
        reject,
        aborted: false,
      };
      queued.onAbort = () => {
        queued.aborted = true;
        reject(abortReason(signal!, "Queued structure load was cancelled"));
      };
      signal?.addEventListener("abort", queued.onAbort, { once: true });
      this.queue.push(queued as QueuedTask);
      this.drain();
    });
  }

  private drain(): void {
    if (this.active) return;
    let queued = this.queue.shift();
    while (queued?.aborted) {
      if (queued.onAbort) queued.signal?.removeEventListener("abort", queued.onAbort);
      queued = this.queue.shift();
    }
    if (!queued) return;
    this.active = true;
    if (queued.onAbort) queued.signal?.removeEventListener("abort", queued.onAbort);
    Promise.resolve()
      .then(() => {
        throwIfAborted(queued.signal);
        return queued.task();
      })
      .then(queued.resolve, queued.reject)
      .finally(() => {
        this.active = false;
        this.drain();
      });
  }
}

export const structureBuildGate = new ExclusiveTaskGate();
