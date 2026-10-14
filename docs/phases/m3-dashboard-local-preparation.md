# M3 dashboard local preparation

This isolated local slice implements the requested Next App Router, React/TypeScript,
Tailwind and a reviewed local shadcn-style Radix tabs wrapper. Zod checks configuration
and review identifiers; the existing compiled `agentci/client` remains the backend
contract and integrity authority. No collection API or new backend operation is added.
The server reads only original admissions supplied by trusted operator configuration,
never a browser-selected replacement subject. The dashboard sends no controller mutations.

The independent `apps/dashboard` package has its own exact dependency lock. Build the
backend first (`npm ci; npm run build`), then `npm ci --prefix apps/dashboard` and
`npm run build --prefix apps/dashboard`. The Next standalone output retains the compiled
SDK, required schema files and dependencies. Copy its `.next/static` directory into
`.next/standalone/apps/dashboard/.next/static` and run the standalone
`apps/dashboard/server.js` with the supported Node version. The local browser harness
copies the entire standalone output into a temporary directory and exercises it there.
UBI image construction/scanning and native/public image acceptance remain pending.

## Session boundary

`AGENTCI_DASHBOARD_CONFIG` is server-only JSON containing `issuer`, `clientId`,
`clientSecret`, exact HTTPS `origin`, `grants`, and `reviews`. Do not set a `NEXT_PUBLIC`
variant. `grants` is keyed by JSON-encoded `[issuer, subject]` and maps to the same
issuer/subject, an organization UUID and a bounded repository allowlist. `reviews`
is keyed by admission UUID and contains the complete original `admission`, allowlisted
`apiOrigin` and a separate **evidence-read** `readToken`. No operator, App or provider
credential is accepted by this interface. Actual backend credential access still
requires server authorization. Use a privately injected configuration, not a committed
file, URL, browser storage or client input.

The issuer and UI origin require HTTPS. Register only the exact
`origin/auth/callback` redirect. `openid-client` discovery and code exchange validate
issuer/audience/expiry/nonce, with signature verification explicitly enabled. Every
login uses one-use server-held state, nonce and PKCE S256. No access/ID token is
retained in the browser. Opaque server sessions rotate the old session on sign-in,
expire after 30 minutes, and revoke on CSRF-protected same-origin logout. Cookies
are `__Host-`, Secure, HttpOnly and SameSite=Lax. The login transaction expires after
five minutes. The in-memory stores are bounded to 1000 entries and support only a
single process: restart revokes sessions; replicas require a shared revocable store
before a distributed deployment can be claimed.

Every view and data route checks a session and organization/repository authorization
before backend access. Cache headers are private/no-store; the client rechecks the
session on focus, page restoration and every 30 seconds. Protected content hides
while verification is in flight and when the trusted server remaining lifetime
elapses; the timer uses a monotonic clock and subtracts the full request duration.
Session expiry does not mark retained evidence expired. Protected content is bound
to a non-authorizing per-session view identity, so revalidation under a different
valid account cannot reveal an earlier cached account view. Closing or navigating a
page interrupts browser reads only; it never cancels controller work. Missing user
sessions return 401, denied scope 403, and backend credential failures 502. Evidence
errors stay distinct from successful completion. Raw upstream exception text is not
returned or logged.

## Detail and evidence limits

The view binds repository/PR/base/head/admission/profile and displays execution state,
selected-file/role coverage, individual role results, synthetic mode, pinned finding
versions and retained evidence digests. Completed does not imply clean. Missing
summary/receipt is unknown/unavailable. Model disagreement is explicitly not established
by the available summary. Operator dispositions do not establish verified fixes;
cancellation intent does not establish cleanup. No export UI is implemented in this
bounded slice; complete export/end-and-EOF acceptance remains required later.

## Local verification and outstanding acceptance

`npm run test --prefix apps/dashboard` runs real signed OIDC protocol fixtures and
actual-client HTTP fixtures. These are synthetic test evidence, not a configured
customer issuer or enterprise SSO deployment. `node apps/dashboard/tests/browser/check.mjs`
uses an explicitly configured existing executable (`AGENTCI_BROWSER_EXECUTABLE`),
or the locked Playwright bundled Chromium by default, a hermetic production standalone copy,
and an explicit **test-process-only** preload under `tests/browser/bootstrap.ts`.
That preload is never imported by production routes. A separate server without it or
OIDC configuration must fail closed. The harness retains local screenshots and a
credential-free result under `.agentci/artifacts/dashboard-browser`; its temporary
fixture session handshake has mode 0600 and is removed on completion. No cookie,
code, token or key is recorded in screenshots or published logs.

Original UI foundation, session and dashboard tasks remain pending. Local software
preparation does not close original UBI packaging/license/security acceptance, full
browser corpus (complete exports and interrupted login return paths),
real reference-IdP/HTTPS configuration, customer walkthrough, publication/native image
checks or any M3 release gate. All three model adapters and M0–M10 order remain intact.
No UI PR, push, merge, deployment or persistent access is performed by this slice.

Dependencies were checked against the official registry and documentation on
2026-10-12: [Next installation](https://nextjs.org/docs/app/getting-started/installation),
[openid-client code flow](https://github.com/panva/openid-client),
[Zod](https://zod.dev/). The package audit is recorded separately; it does not replace
image scans or an operational issuer audit.

The extended bounded browser corpus covers exact-subject rapid navigation with a
delayed obsolete response, closing an active read without controller mutations,
HTTP 404/409/413/503 failures, completed refusal with zero completed roles, and
server-session expiry. Test-only screenshots are named `fixture-exact-review-detail`,
`fixture-missing-evidence`, and `fixture-session-expired`; they are not live customer
or configured OIDC acceptance. Other export/history traversal and full browser
acceptance remain pending.

## Dedicated hosted verification preparation

`.github/workflows/dashboard-verify.yaml` builds the existing SDK and this independent
UI package from locked installs, typechecks/tests/audits, installs normal bundled
Playwright Chromium in hosted CI and runs the isolated standalone fixture corpus.
Actions are pinned to the repository-approved commits. Explicit Bash preserves
command failures through log pipelines. The always-run receipt binds actual source
commit/tree, run/attempt, individual stage outcomes, and fixture/log hashes. Missing,
stale, incomplete or mutated browser proof cannot certify all-success stages.
Always-upload artifacts remain explicitly software/fixture evidence, including failures;
they do not prove live SSO/customer, image distribution or milestone acceptance.

`Refresh read` performs a Next RSC read refresh. The protected boundary is keyed by
the non-authorizing per-session identity and renders valid children only for the
identity actually verified in state. A changed prop cannot reuse an earlier valid
state while its new verification is still pending.

## Retained references and read interruption rework

The primary view is an authenticated scoped server shell. Its detail loader reads
the existing authorized API route with a browser AbortController; obsolete subject
responses, component cleanup and page hiding abort that read. The route combines
its public Request signal with server session revocation/rotation/expiry signals.
No unsupported Next server-component cancellation internals are used. The existing
SDK `finding` read accepts an additive optional AbortSignal and forwards it to both
its exact-admission check and pinned finding request. Server credentials stay outside
the client bundle and props. Closing a view never calls controller cancellation.

A single 15-second deadline, 8 MiB aggregate display budget and the existing
64-finding manifest bound cover the complete view read, including repeated admission
checks and retained records. These are operational resource limits, not new milestone
quality thresholds. Budget/deadline failure cannot certify a partial passing view.

Retained reference anchors activate the Evidence tab before mounting/focusing their
exact retained article. Direct hash navigation is supported. A retained record
without an execution receipt remains explicitly unverified; navigation cannot
establish reproduction or a verified fix. Nonempty domain-validated synthetic
fixtures test actual backend response closure on view close and session revocation.

The 8 MiB traversal budget is enforced in the SDK on actual consumed response-body
bytes before JSON parsing, including padded payloads and all repeated admission
reads. A separate decoded display accounting guard also remains. Payload framing
and HTTP/TLS headers are not represented as JSON body bytes. Server shells validate
admissions with the production validator before any public list/RSC/client projection,
then recheck the original session after asynchronous work. Extra configuration fields
are rejected without serializing their values or accessing the backend.

Browser hash changes and Back/Forward navigation synchronize the active tab: a
recognized retained-evidence hash activates and focuses that exact article; an
empty or unrelated hash restores Summary and clears a pending evidence target.
The production fixture corpus exercises real Back/Forward traversal without backend
mutations. This bounded navigation repair does not establish the remaining full
interruption/export/history corpus or live customer acceptance.

### Local dashboard UBI packaging preparation

The optional `dashboard` Docker target uses the existing pinned UBI base and Node 26.10.0/npm 12.2.0. It preserves the six existing service targets and default target. Next needs root build declarations, so the dashboard builder restores the locked dependency-stage modules before compiling, prunes root development dependencies after compilation, then removes only traced root entries explicitly marked `dev: true` in the unchanged shrinkwrap. Production/shared entries remain. The final stage contains the standalone server and static assets, corresponding installed-source license notices, Node's notice and AgentCI's MIT notice; it runs as UID 1001 without npm. The runtime uses server-side configuration only, with no browser test bootstrap or development loader.

Build locally with `docker build --target dashboard --build-arg SOURCE_COMMIT=<reviewed-full-source-SHA> --build-arg DASHBOARD_LOCK_SHA256=<UI-lock-SHA256> --build-arg ROOT_LOCK_SHA256=<root-shrinkwrap-SHA256> -t agentci-dashboard-local .`. No candidate workflow, publication role or destination is activated by this target. The global build context excludes dependencies, generated Next output, tests, private environment/configuration files and key paths. `scripts/dashboard-license-inventory.mjs` inventories actual runtime package identities and copies exact installed-source notices. Missing notices/declarations remain explicit review items; ancestor package provenance does not imply license approval.

This current-main port uses SDK source version 0.4.0-m3-dev.3 and dashboard version 0.0.0-local-m3. The frozen development candidate source and assets remain unchanged; building current source does not verify the downloaded candidate. The local Linux AMD64 JavaScript standalone check copies only the prepared runtime and notices into an owned temporary directory, restricts filesystem access to that directory, starts the plain production entrypoint without `NODE_PATH`/`NODE_OPTIONS`, verifies anonymous private-route rejection and absence of a runtime-only configuration canary in responses/assets, and proves owned process/path cleanup. It does not exercise a real identity provider or prove container UID 1001, native image execution, ARM64, public downloads or deployed behavior.

The earlier preserved local qualification reported an approved UBI registry pull HTTP 403, with no approved local UBI image available. This port has not retried that pull. Actual UBI build/runtime, OS/RPM/license inventory and pinned Trivy image CVE scan therefore remain blocked and unverified. Package or npm audit results cannot substitute for that image scan. A future image check must use the existing reviewed Trivy 0.75.0 digest, inspect the exact built dashboard image, retain findings and independently validate the result. Local dependency reuse and offline cache failures are recorded separately from fresh installation/download claims. All 18 M3 acceptance gates remain pending.
