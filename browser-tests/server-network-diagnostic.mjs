// Optional instrumentation of the owned test server. Delegates every fetch
// unchanged; never intercepts a production or developer-owned process.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const address = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (address.hostname !== "api.example.test") return nativeFetch(input, options);
  const started = Date.now();
  const signal = options?.signal ?? (input instanceof Request ? input.signal : undefined);
  const aborted = () => console.error("owned SSR fetch abort", { path: address.pathname, ms: Date.now() - started });
  signal?.addEventListener("abort", aborted, { once: true });
  console.error("owned SSR fetch start", { path: address.pathname });
  try {
    const response = await nativeFetch(input, options);
    console.error("owned SSR fetch headers", { path: address.pathname, ms: Date.now() - started, status: response.status });
    return response;
  } catch (error) {
    console.error("owned SSR fetch failure", { path: address.pathname, ms: Date.now() - started, name: error?.name });
    throw error;
  } finally {
    signal?.removeEventListener("abort", aborted);
  }
};
