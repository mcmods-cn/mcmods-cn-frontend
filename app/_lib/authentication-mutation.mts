const lockName = "mcmods-authentication-write-v1";
const paths = new Set(["/api/v1/auth/login", "/api/v1/auth/email-login", "/api/v1/auth/register", "/api/v1/auth/logout"]);
const unavailableMessage = "Sign-in could not be coordinated between browser tabs. Enable browser storage and reload, or use a browser with Web Locks or SharedWorker support. Your form has been preserved.";

export type AuthenticationMutation = {
  fetch: typeof fetch;
  assertCurrent: () => void;
};

type WorkerReply = {
  id: string;
  status?: number;
  statusText?: string;
  headers?: [string, string][];
  body?: ArrayBuffer;
  error?: string;
  errorName?: string;
};
type PendingReply = { resolve: (response: WorkerReply) => void; reject: (error: Error) => void };
let shared: SharedWorker | undefined;
const pending = new Map<string, PendingReply>();

function abortError() { return new DOMException("Authentication operation was cancelled", "AbortError"); }

function worker() {
  if (shared) return shared;
  if (typeof SharedWorker === "undefined") throw new Error(unavailableMessage);
  try {
    shared = new SharedWorker("/authentication-write-worker.js", { name: lockName });
    shared.port.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const request = pending.get(reply.id);
      if (!request) return;
      pending.delete(reply.id);
      if (reply.error) {
        const error = new Error(reply.error);
        error.name = reply.errorName || "Error";
        request.reject(error);
      } else {
        request.resolve(reply);
      }
    };
    const failed = () => {
      const previous = shared;
      shared = undefined;
      // The worker owns any in-flight fetch. Ask it to abort before closing
      // this port; it never releases a queued write until that fetch settles.
      try { previous?.port.postMessage({ type: "disconnect" }); } catch { /* A terminated worker owns no future request. */ }
      previous?.port.close();
      for (const request of pending.values()) request.reject(new Error(unavailableMessage));
      pending.clear();
    };
    shared.onerror = failed;
    shared.port.onmessageerror = failed;
    shared.port.start();
    return shared;
  } catch {
    shared = undefined;
    throw new Error(unavailableMessage);
  }
}

function request(port: MessagePort, message: { id: string; [key: string]: unknown }) {
  return new Promise<WorkerReply>((resolve, reject) => {
    pending.set(message.id, { resolve, reject });
    try { port.postMessage(message); } catch (error) { pending.delete(message.id); reject(error); }
  });
}

function checkedRequest(input: RequestInfo | URL, init: RequestInit | undefined, apiBaseURL: string) {
  const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const base = apiBaseURL.replace(/\/$/, "");
  if (![...paths].some(path => target.href === base + path) || init?.method?.toUpperCase() !== "POST" || typeof init.body !== "string" && init.body !== undefined) {
    throw new Error("Unsupported authentication write");
  }
  return target.href;
}

/**
 * Queue the intent synchronously, before clearAuth broadcasts its guest state.
 * The lock includes parsing and saveAuth, so a later successful write cannot
 * publish before an earlier reply. There is deliberately no lease or timeout.
 */
export function runAuthenticationMutation<T>(apiBaseURL: string, operation: (context: AuthenticationMutation) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const id = globalThis.crypto.randomUUID();
  let requestCount = 0;
  let port: MessagePort | undefined;
  const signalCleanups: Array<() => void> = [];
  const cancel = () => {
    controller.abort();
    port?.postMessage({ type: "cancel", id });
    pending.get(id)?.reject(abortError());
    pending.delete(id);
  };
  window.addEventListener("pagehide", cancel);
  const assertCurrent = () => { if (controller.signal.aborted) throw abortError(); };
  const observeSignal = (signal?: AbortSignal | null) => {
    if (!signal) return;
    if (signal.aborted) cancel();
    else {
      signal.addEventListener("abort", cancel, { once: true });
      signalCleanups.push(() => signal.removeEventListener("abort", cancel));
    }
  };
  const finish = () => {
    window.removeEventListener("pagehide", cancel);
    for (const cleanup of signalCleanups) cleanup();
    port?.postMessage({ type: "ack", id });
  };
  const fetchUnderLock: typeof fetch = (input, init) => {
    observeSignal(init?.signal);
    assertCurrent();
    checkedRequest(input, init, apiBaseURL);
    if (++requestCount !== 1) throw new Error("Only one authentication write is allowed per operation");
    return fetch(input, { ...init, signal: controller.signal });
  };
  if (navigator.locks?.request) {
    return Promise.resolve(navigator.locks.request(lockName, { mode: "exclusive", signal: controller.signal }, () => operation({ fetch: fetchUnderLock, assertCurrent }))).then(value => value).finally(finish);
  }

  try {
    port = worker().port;
    // The worker reserves the complete operation, not only its HTTP request.
    // Its native fetch and lock remain owned until our finally acknowledgement.
    const acquired = request(port, { type: "begin", id });
    const workerFetch: typeof fetch = (input, init) => {
      observeSignal(init?.signal);
      assertCurrent();
      const url = checkedRequest(input, init, apiBaseURL);
      if (++requestCount !== 1) throw new Error("Only one authentication write is allowed per operation");
      return request(port!, { type: "fetch", operationId: id, id: globalThis.crypto.randomUUID(), url, method: "POST", headers: [...new Headers(init?.headers)], body: init?.body ?? "" })
        .then(reply => new Response(reply.status === 204 || reply.status === 205 ? null : reply.body, { status: reply.status, statusText: reply.statusText, headers: reply.headers }));
    };
    return acquired.then(() => { assertCurrent(); return operation({ fetch: workerFetch, assertCurrent }); }).finally(finish);
  } catch (error) {
    finish();
    return Promise.reject(error);
  }
}
