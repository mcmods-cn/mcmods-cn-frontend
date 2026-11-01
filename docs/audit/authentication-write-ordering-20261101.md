# DGR-002: order browser session writes across tabs

The original authentication-generation guard prevents a late old-session 401 or
invalid header from changing a newer JavaScript identity. It cannot prevent the
browser from applying a late `Set-Cookie` header. An actual API/PostgreSQL/native
browser counterexample showed a held A logout response deleting a newly logged-in
B cookie: B `/auth/me` changed from 200 to 401 while B's server session remained
unrevoked. The separate optional-auth read-side cookie-expiry fix is also required.

`runAuthenticationMutation` queues a complete operation, including response
parsing and `saveAuth`. `clearAuth` registers its logout intent before publishing
guest state. Password login, email-code login and registration wait on the same
origin-wide Web Lock. A genuinely invalid current response retains the existing
authentication-generation behavior. A failed form submission does not publish a
successful identity and preserves the input for an explicit retry.

When Web Locks are unavailable in a window, a same-origin SharedWorker owns the
actual credentialed fetch. Its queue remains held until the caller acknowledges
that parsing and identity publication have finished. A cancelled callback checks
its operation before publishing; a later success cannot be overwritten by its old
reply. Cancellation or page closure aborts the worker-owned request, and the queue
waits for its network terminal before the next operation. A background/frozen
publisher is not expired by a timer. When available in the worker, the same native
Web Lock also coordinates mixed-capability windows. There is no storage lease,
IDB keepalive transaction, polling loop or timeout that permits overtaking.

The worker reads only the public build configuration at
`/authentication-write-config`. It accepts one POST per operation to the exact
configured API base and `/api/v1/auth/login`, `email-login`, `register` or `logout`.
It rejects a client-selected origin, other paths, redirects, unsupported headers,
and request/response bodies larger than 1 MiB. Actual cookies and browser-provided
headers are handled by native `fetch`, with credentials included. No cookie,
password, bearer token or response body is logged. Browsers with neither Web Locks
nor SharedWorker receive a recoverable error; the form remains intact and no
unsafe parallel request is issued. Re-enable the relevant browser capability or
use a supported browser, then explicitly retry.

OAuth links retain normal anchors, modifier clicks and new-tab navigation. Their
internal `/login/provider` landing page validates the existing provider and return
path and waits for queued logout before navigating to the original API start URL.
The callback's client identity publication also participates in the queue. This
does not prove any external provider callback or define the session-selection
policy for independently concurrent provider logins; those require the relevant
provider configuration and a separate acceptance scope.

## Validation and deployment

`node --test --test-concurrency=1 browser-tests/authentication-write.browser.mts`
uses actual browser HttpOnly cookies, Web Locks, SharedWorker and an owned HTTP
fixture. Both window and worker Web Locks are explicitly hidden for compatibility
cases; the production worker logic is otherwise unchanged. It covers delayed
logout, all three form endpoints, publication ordering, cancellation/closing
before and after response, background freeze/resume, failed login, network failure,
size limits, unsupported capabilities and foreign-origin rejection. This is a
browser/component transport layer, not a real backend/database test. The original
real counterexample, new real native regression, exact repository combination
and PostgreSQL observations are recorded separately in the task's evidence ledger.

Ship the client, public worker and configuration route together, with the same
`NEXT_PUBLIC_API_BASE_URL`; the existing deployment validator still requires HTTPS
for production. Retain the public worker in the standalone/Docker public asset
copy. Previously loaded frontend code does not participate in this newly added
coordination: refresh those tabs before claiming this ordering guarantee across
all of a user's windows. There is no database migration or production data repair.
A rollback must keep a mutually compatible client/worker/configuration set.
