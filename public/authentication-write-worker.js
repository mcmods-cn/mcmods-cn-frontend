/* Same-origin fallback when Web Locks are unavailable in a window. The worker
 * owns credentialed fetches and retains the queue until the caller has parsed
 * and published its result, or cancelled. No expiring lease or polling. */
const lockName = "mcmods-authentication-write-v1";
const paths = ["/api/v1/auth/login", "/api/v1/auth/email-login", "/api/v1/auth/register", "/api/v1/auth/logout", "/api/v1/auth/logout/if-current"];
const allowedHeaders = new Set(["content-type", "authorization", "x-client-id", "x-request-id"]);
const maxBytes = 1024 * 1024;
const jobs = new Map();
let tail = Promise.resolve();
let configuration;

function apiBase(signal) {
  if (!configuration) {
    configuration = fetch("/authentication-write-config", { credentials: "same-origin", redirect: "error", signal })
      .then(async response => {
        if (!response.ok) throw new Error("Authentication configuration is unavailable; retry sign-in.");
        const data = await response.json();
        const url = new URL(data.apiBaseURL);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid authentication configuration");
        return data.apiBaseURL.replace(/\/$/, "");
      }).catch(error => { configuration = undefined; throw error; });
  }
  return configuration;
}

function send(port, message, transfer = []) {
  try { port.postMessage(message, transfer); } catch { /* A closed owner cannot publish a stale result. */ }
}

function cancelled() { return new DOMException("Authentication operation was cancelled", "AbortError"); }
function cancel(job) {
  job.controller.abort();
  job.ack();
}

async function network(job, message) {
  try {
    const base = await apiBase(job.controller.signal);
    if (!paths.some(path => message.url === base + path) || message.method !== "POST" || typeof message.body !== "string" || new TextEncoder().encode(message.body).byteLength > maxBytes) throw new Error("Unsupported authentication write");
    const headers = new Headers(message.headers);
    for (const [name, value] of headers) if (!allowedHeaders.has(name) || value.length > 16_384) throw new Error("Unsupported authentication header");
    if (job.controller.signal.aborted) throw cancelled();
    const response = await fetch(message.url, { method: "POST", headers, body: message.body, credentials: message.credentials === "omit" ? "omit" : "include", redirect: "error", signal: job.controller.signal });
    const reader = response.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maxBytes) { job.controller.abort(); throw new Error("Authentication response exceeded its size limit"); }
        chunks.push(next.value);
      }
    }
    if (job.controller.signal.aborted) throw cancelled();
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    send(job.port, { id: message.id, status: response.status, statusText: response.statusText, headers: [...response.headers], body: body.buffer }, [body.buffer]);
  } catch (error) {
    send(job.port, { id: message.id, error: error instanceof Error ? error.message : "Authentication request failed", errorName: error instanceof Error ? error.name : "Error" });
  }
}

async function execute(job, id) {
  try {
    if (job.controller.signal.aborted) throw cancelled();
    job.active = true;
    send(job.port, { id, canOmitCookies: true });
    await job.acknowledged;
    // A cancelled/closed caller does not release the queue while its real
    // fetch could still apply a cookie. Wait for the worker's network terminal.
    await Promise.allSettled([...job.requests]);
  } catch (error) {
    send(job.port, { id, error: error instanceof Error ? error.message : "Authentication request failed", errorName: error instanceof Error ? error.name : "Error" });
  } finally {
    jobs.delete(id);
  }
}

self.onconnect = event => {
  const port = event.ports[0];
  const disconnect = () => { for (const job of jobs.values()) if (job.port === port) cancel(job); };
  port.onmessage = event => {
    const message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "disconnect") { disconnect(); return; }
    if (message.type === "ack" || message.type === "cancel") {
      const job = jobs.get(message.id);
      if (!job || job.port !== port) return;
      if (message.type === "cancel") cancel(job); else job.ack();
      return;
    }
    if (message.type === "fetch") {
      const job = jobs.get(message.operationId);
      if (!job || job.port !== port || !job.active || job.controller.signal.aborted || typeof message.id !== "string" || job.requestCount !== 0) {
        send(port, { id: message.id, error: "Authentication operation is no longer active", errorName: "AbortError" });
        return;
      }
      job.requestCount++;
      const running = network(job, message);
      job.requests.add(running);
      void running.finally(() => job.requests.delete(running));
      return;
    }
    if (message.type !== "begin" || typeof message.id !== "string" || message.id.length > 100 || jobs.has(message.id)) return;
    let acknowledge;
    const job = { port, active: false, requestCount: 0, controller: new AbortController(), requests: new Set(), acknowledged: new Promise(resolve => { acknowledge = resolve; }), ack: () => acknowledge() };
    jobs.set(message.id, job);
    const run = () => execute(job, message.id);
    // WorkerNavigator may expose Web Locks when a particular window does not.
    // The same lock prevents mixed capability tabs from overtaking each other.
    tail = tail.then(() => self.navigator.locks?.request ? self.navigator.locks.request(lockName, { mode: "exclusive" }, run) : run()).catch(error => {
      jobs.delete(message.id);
      send(port, { id: message.id, error: error instanceof Error ? error.message : "Authentication coordination failed" });
    });
  };
  port.addEventListener("close", disconnect);
  port.onmessageerror = disconnect;
  port.start();
};
