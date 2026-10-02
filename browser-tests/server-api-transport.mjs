// Explicit server-side transport substitute for owned browser tests. Real
// Next metadata and BFF code still fetch real HTTP; only the API destination
// is mapped to a controlled loopback provider. No production import exists.
const origin = new URL(process.env.MCMODS_TEST_API_ORIGIN ?? "");
if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password) {
  throw new Error("The browser test API provider must be owned loopback HTTP");
}
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const address = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (address.hostname !== "api.example.test") return nativeFetch(input, init);
  const request = new Request(input, init);
  return nativeFetch(new URL(address.pathname + address.search, origin), {
    method: request.method, headers: request.headers, body: request.body,
    signal: request.signal, redirect: request.redirect, cache: request.cache,
    credentials: request.credentials, duplex: "half",
  });
};
