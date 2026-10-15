# Native dashboard active public request shutdown qualification

The existing optional dashboard native workflow now also tests a real active
**public login error-path request** on AMD64 and ARM64. It starts the actual
UBI dashboard image using its unchanged plain Node command, UID 1001, network-none,
read-only root, dropped capabilities, no-new-privileges and existing resource
bounds. No host port, socket, certificate, CA, loader, production test endpoint,
credential or trust setting is added. This is separate from the existing
production-standalone authenticated API 200 fixture proof.

An additional owned UID 1001 Node exec process listens only on the container's
loopback interface. A production POST `/auth/login` performs real HTTPS OIDC
discovery toward this synthetic issuer. The fixture recognizes and holds a TLS
ClientHello; it sends no TLS bytes and never presents a certificate. No invalid
certificate is accepted. The receipt requires both the application request and
issuer socket pending before SIGTERM, cleanup-start without cleanup-finished,
a still-running process and pending request after a further bounded hold. The
fixture then closes its held socket, causing the existing public handler's
expected complete 403 `Sign-in unavailable` response. The oracle requires that
exact body hash/size, private cache headers, no issued cookie, ordered pinned Next
cleanup markers, exit 143, no OOM/force/timeout and the same source/tree/locks,
image, handler, PID1 and Node binary bindings as idle shutdown qualification.

This establishes an active public error-path response plus source-bound framework
completion, not an independently timed observation that a remote client consumed
bytes before the final cleanup log write. The client runs inside the owned
container's network namespace and reports only bounded status/size/hash fields.
If container termination interrupts its complete-body observation, qualification
fails rather than treating a sent response as a consumed response.

Two independent native controls start fresh owned containers. SIGKILL must
interrupt the held real request with exit 137 and no cleanup markers. A separately
labeled **unsupported signal-handler command** uses this exact negative-only
command before importing the same generated server from the same image:

```text
node --input-type=module -e "process.on('SIGTERM',()=>process.exit(143));await import('./apps/dashboard/server.js');"
```

Ordinary SIGTERM must produce actual abrupt 143, an interrupted request and no
cleanup markers. The production command validator must reject that command;
the separate response/marker behavioral oracle also rejects the observed result.
All remaining native UID, image/source/runtime, isolation and resource checks
remain required. Positive and SIGKILL containers retain the original plain Node
command and production signal environment. No handler is injected into the image
or positive process, no production framework source is patched, and no exit code
is rewritten in retained evidence. The negative command is an intentionally
ungraceful fixture and cannot qualify as production runtime configuration.

Preserved native attempts 38749492560 and 38749787911 tested a narrower manual-flag
negative before this command correction. Their actual public login drain and
SIGKILL observations passed, but the manual-flag PID1 process remained running
with no markers and an incomplete request. Docker's nonterminal ExitCode field 0
is not an observed completed exit. The abrupt 143 expectation failed and image
scanning was not reached. Both architectures' actual artifacts and successful
owned zero-resource cleanup are preserved. The implementation does not force or
reinterpret those prior states as abrupt 143. The new command fixture supplies a
separate, explicitly unsupported negative execution; hosted evidence is pending.

`public-drain-progress.json` retains bounded, explicitly partial observations at
readiness, fixture, request hold, signal, release and stop boundaries, including
known observations before rethrow. It omits raw errors, diagnostics, response
bodies and configuration. Partial progress cannot satisfy the success oracle.
`public-drain.json` is retained before validation, including failed controls, and
is included in the existing bounded 32 MiB allowlisted public artifact archive.
The final result requires this proof as well as all three existing idle modes,
actual inventory/scan and owned zero-resource cleanup. Hosted exact-source CI and
independent actual-artifact review remain required. No local Docker execution is
claimed: access to the Mac daemon remains denied and was not probed.

**Limits:** native authenticated API 200 drainage remains unverified. No session
is seeded and no successful OIDC discovery, login, token exchange or customer
endpoint is claimed. Real authenticated native acceptance needs a later approved
HTTPS/OIDC environment; no cluster is available now. Existing standalone synthetic
API 200 tests remain separately labeled. The six frozen service images and dev.3/
dev.4 assets are unchanged. All 1,346 requirements, 18 M3 gates, service scan
qualifications and unresolved provenance/licensing decisions remain open as
previously recorded; this narrow proof cannot establish M3 or release completion.
