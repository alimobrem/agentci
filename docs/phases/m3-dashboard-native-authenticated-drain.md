# Native dashboard authenticated request shutdown fixture

Task `M3-dashboard-native-authenticated-drain` adds an explicitly approved,
synthetic HTTPS/OIDC fixture to the existing native dashboard workflow. The
application image, generated Next server and plain Node PID1 command stay intact.
The original public login-error-path and idle shutdown proofs remain separate.
This work does not change production auth/session/API code or establish live
identity-provider, browser, customer, hosting, legal or release acceptance.

## Trust and isolation boundary

The disposable application container remains UID 1001, network-none, read-only,
cap-drop ALL and no-new-privileges, with pids 128, memory 512 MiB, CPU 1 and
`/tmp:rw,noexec,nosuid,nodev,size=64m`. It retains
`DEBUG=next:start-server` for the pinned framework cleanup markers. The only
fixture trust addition is a fresh, short-lived public CA PEM, mounted as one
readonly file at `/run/agentci-fixture-ca.pem`, with startup
`NODE_EXTRA_CA_CERTS` pinned to that exact path and certificate hash. No CA
private key enters the application or helper. No Mac, runner-host or system trust
store is changed. Certificate/hostname verification stays enabled.

One owned helper uses the same native image and shares only the application's
isolated network namespace. Its PID/filesystem namespaces remain separate, so
the observer can remain alive after application PID1 exits. The helper's explicit
fixture command is not a production command. It receives synthetic leaf/JWK
keys and configuration through private stdin; its HTTPS client receives only the
public fixture CA as request-level trust. No helper global CA setting, engine
socket, host port, host network, external service or persistent access is added.
All private state stays in owned temporary storage and is excluded from public
artifacts.

The strict default validator rejects the CA fixture. A separately named fixture
validator must bind the exact image, owner, base environment, approved additions,
public CA path/hash/readonly mount, hostname, topology and isolation options.
Inspect effective mounts/environment without publishing raw values: of the TLS
and signing material, only the public CA may enter the application, with no
issuer/signing key or helper control credential. Its hash must bind the actual
presented fixture certificate chain. The application's private synthetic OIDC and
backend configuration remains separately bounded and never appears in artifacts.
TLS bypasses, unrelated trust/proxy configuration, loaders and command overrides
remain rejected. Default rejection caused by a CA mount is not proof that a
particular command was rejected: the positive fixture validator must separately
reject the exact unsupported abrupt command. Its negative-only validator keeps
every other fixture restriction.

## Characterization before drainage

The first draft head characterizes both native AMD64 and ARM64 before enabling
the new signal scenarios. Its authenticated drainage status stays unverified.
The configured application origin is `https://dashboard.fixture.invalid:3000`;
the application binds that hostname to `127.0.0.1:3000`. A helper TLS frontend
listens on `127.0.0.2:3000`, using the exact hostname SAN, and forwards normal
origin-form HTTP to the application with the fixed forwarded HTTPS scheme. Only
the helper client's lookup maps that hostname to the frontend address.

This same-port layout addresses pinned Next's reconstruction of callback origin
from the configured server hostname and port. Actual successful login/callback,
session issuance and protected API200 must establish feasibility; forwarded Host
headers alone do not prove it. A failure stops the gate and retains bounded
evidence. No session seeding, absolute-form callback target, auth replacement,
HTTP issuer or silent production configuration repair is permitted.

The synthetic issuer runs on owned loopback HTTPS and serves actual discovery,
authorization, token and JWKS routes. It authenticates the registered client,
checks the exact redirect URI, binds state/nonce/S256 challenge to a single-use
authorization code and verifies the actual token-exchange verifier against that
challenge. The signed ID token carries the expected issuer, audience, subject,
nonce and time claims. The production OIDC library and callback create the real
process-local session cookie. The harness checks its attributes without retaining
its value. This is a synthetic Node-client flow, not browser secure-cookie or
live-provider acceptance.

Absent-CA, wrong-CA, wrong-hostname and expired-certificate controls use fresh
application/helper instances. They must observe actual authentication failure,
no issued session and denied protected reads; cached discovery, JWKS or a prior
session cannot satisfy a control. Pair each TLS negative with a fresh successful
positive and demonstrate that it reached the intended TLS listener; generic403
from startup failure is insufficient. Native receipts observe the genuine
successful PKCE/client-authenticated exchange and these TLS negatives. Pure
protocol behavior tests separately reject a wrong client, wrong verifier and
code replay; native protocol-adversarial exchanges are not claimed.

## Held authenticated request and controls

After both architecture characterization receipts pass, the full phase must
require authenticated drainage in its success oracle. Each positive, SIGKILL
and unsupported abrupt143 scenario starts fresh, independently completes real
login and a baseline API200, then issues its own protected production review
read. A unique held-request marker binds the observer and authenticated backend
read; readiness traffic or failed authentication cannot stand in for that read.
The proxy does not retry, cache or synthesize API200. Retain bounded distinctions
between its upstream timeout/error and the observed client's interruption.

For SIGTERM, the receipt must show the authenticated request held at the exact
TLS backend before signaling, cleanup started, the app still alive, no finished
marker and the request still pending for at least 300 ms. Explicit release occurs
within six seconds of the hold, before the helper's seven-second watchdog,
7.6-second proxy timeout and 7.8-second fixture-client timeout. A watchdog release,
proxy/client timeout or abort cannot qualify. Require the complete expected API200
body size/hash, private cache headers, ordered pinned cleanup markers, actual
exit143, no OOM, force or timeout, and an independently live helper after app
exit. This is a queued-status read with the real validated subject/schema; it
does not establish completed-review evidence drainage or a client-consumption
timestamp before the final framework log write.

Fresh SIGKILL137 and the previously reviewed unsupported abrupt143 command must
interrupt their own authenticated, demonstrably held requests. The helper must
remain live to distinguish application interruption from observer failure. Real
exit/state, incomplete response and absent cleanup completion must cause the
graceful behavior predicate to reject each control independently of its mode
label or command rejection. Observe that interruption before helper shutdown,
which itself destroys pending requests. The abrupt command remains a negative
fixture; it cannot qualify as a production configuration.

## Evidence, recovery and completion

`authenticated-drain-progress.json` is bounded, redacted and explicitly partial.
`authenticated-characterization.json` preserves the strict eight-case proof
before any signal scenario. `authenticated-drain.json` is the mandatory full
wrapper containing that characterization and all three fresh signal cases; the
source fixes the full stage, with no environment switch that can skip a case.
It retains source/tree/candidate/run/attempt, native
image/runtime, public certificate/peer/fixture identities and observed outcomes
before validation. None of the files may contain keys, tokens, cookies, private
configuration, response bodies, raw environment, stdout/stderr or raw exceptions.
All three use the existing bounded allowlisted artifact publisher; partial receipts
cannot qualify as success.

The [first characterization attempt](../../delivery/acceptance/m3-dashboard-authenticated-characterization-attempt-38820624422.json)
failed on both native architectures at the first absent-CA authentication control.
The exact rejected observation was not retained, so its cause remains unproven.
Both failed artifact archives and their indexed bytes were verified, and both
cleanup receipts show zero owned resources with private files removed. Subsequent
diagnostic instrumentation retains only a typed failed observer snapshot; it does
not loosen the success oracle, establish an eight-case pass or enable drainage.

The [diagnostic attempt](../../delivery/acceptance/m3-dashboard-authenticated-characterization-attempt-38822151809.json)
retains a valid typed absent-CA observation on both architectures. Each shows an
issuer TLS attempt/failure with no HTTP exchange, but an empty presented leaf DER
hash array. This proves the rejected invariant; the receipts do not prove why the
capture was empty. An earlier live socket certificate observation remains subject
to the same strict hash requirement and actual hosted feasibility checks.
The issuer-only hook uses Node's documented server `keylog` event to reach that
live socket; it never reads, hashes, stores, emits or outputs the event's secret
line argument. Only the existing bounded public DER-hash observer receives the
socket. Existing secure-connection and TLS-error observers remain in place, with
no configured-certificate fallback or key-log file/trace option. Node documents
that [socket certificate access can return undefined after destruction](https://nodejs.org/api/tls.html#tlssocketgetx509certificate);
that is a lifecycle explanation consistent with this missing observation, not a
new fact established by the failed receipts.

The [third attempt](../../delivery/acceptance/m3-dashboard-authenticated-characterization-attempt-38823741781.json)
passes the exact committed eight-case characterization oracle on native AMD64
and ARM64. Both actual archives bind the source, images, runtime, global CA and
per-peer DER observations. Each architecture records four real synthetic
login/callback/session/API200 successes and their four fresh paired TLS failures,
natural helper exits and verified zero-resource/private-file cleanup. These are
idle-only shutdown cases: held authenticated-request drainage remains unverified
until the separate three-scenario signal phase passes.

Success requires zero owned app/helper containers, networks and volumes, no
orphan fixture/client processes, and independently checked removal of private
config/key/temp files. Failed execution and recovery remain labeled as failures;
cleanup uncertainty is never cleared by a later unrelated run. Focused tests,
committed-source reconciliation, exact-head hosted CI, actual artifact inspection
and independent review precede merge. Postmerge checks retain their actual source
identities rather than relabeling native premerge image receipts.

The frozen dev.3/dev.4 packages and six service images remain unchanged. Candidate
package lock omission is a separate plan. All 1,346 requirements, 18 pending M3
gates, metadata/licensing gaps, service scan qualifications and live/customer
acceptance limits remain preserved. This fixture cannot close M3 or authorize
publication or customer activation.
