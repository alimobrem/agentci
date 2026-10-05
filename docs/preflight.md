# Deployment and provider preflight

Development feature for M3; not present in released M2 packages. Run this before
changing a webhook endpoint or starting live provider acceptance:

```sh
cp deploy/preflight.example.json /your/private/directory/preflight.json
chmod 600 /your/private/directory/preflight.json
# Edit the image digest, absolute directory and service origin for your deployment.
agentci preflight --config /your/private/directory/preflight.json
```

Exit status is 0 when all requested checks pass, 1 when a probe fails, and 2 for
invalid configuration/arguments. JSON output lists check IDs and sanitized codes,
requested scope, and `paidRequestsMade: false`. It contains no key contents or
private file paths. An empty provider list means provider checks were not requested;
it cannot establish live-provider readiness or close a provider acceptance gate.

The deployment probe runs a short-lived container using a **preinstalled pinned
image with Node available**. It never pulls images implicitly. It runs as UID/GID
1001 with no network, a read-only filesystem and bind mount, dropped capabilities,
and CPU/memory/process/time limits. It compares daemon-visible file hashes with
host files, then removes only its randomly named container and verifies absence.
It does not change deployment containers, volumes, webhooks or configuration.
Use a shared directory supported by the actual container daemon; a path existing
on the laptop alone is insufficient. Probe SQL migrations or public provider JSON
configuration files. To check another directory, use a separate config/invocation.
Do not use this diagnostic to mount credential directories.

Readiness uses an unauthenticated bounded GET to `/readyz` after a successful mount
probe. HTTPS is accepted; plain HTTP is restricted to loopback. Redirects, oversized
or malformed replies, non-200 responses and non-ready states fail. No App key or
service bearer token is sent. Docker is the supported release default; a successful
Podman probe alone would not establish full Podman runtime/isolation support.

To request provider prerequisites, configure `providers` with one entry per initial
provider (`openai`, `anthropic`, `xai`), its official API origin and an absolute
`credentialFile` path. Origins are limited to `https://api.openai.com`,
`https://api.anthropic.com`, and `https://api.x.ai`; no URL credentials, paths,
queries or alternate ports. Keep credential files nonempty, regular, private
(mode 0600 or stricter), at most 64 KiB, and not symlinks. Do not paste keys into
chat, repository files or command arguments. The check opens file handles only;
it does not read key contents, send credentials or prove key validity.

Provider checks require `liveTests` with `authorized: true` and a positive integer
`maxSpendUsdMicros` (1,000,000 means USD 1). Record the owner's actual authorization
and limit before enabling this configuration. Preflight sends only unauthenticated
HEAD connectivity probes, with no model request or billing. A reachable API may
return 401/403/405; the result explicitly says authentication remains unverified.
Redirects, network failures, rate limiting and server failures do not pass.
Actual live tests must separately authenticate and enforce reservations/deadlines
within this ceiling; preflight is not a budget enforcement engine.

Useful failure codes:

| Code | Action |
| --- | --- |
| `invalid-private-preflight-config` | Use a private regular JSON file with the documented exact fields; remove symlinks and excess file permissions. |
| `invalid-mount-probe-config` | Supply a pinned digest, supported engine, absolute directory and plain SQL/JSON filenames. |
| `daemon-mount-unavailable` | Check engine availability, the preinstalled image and daemon directory sharing. |
| `daemon-mount-content-mismatch` | Check that host and daemon see the same files; do not start migrations with mismatched bytes. |
| `mount-probe-cleanup-unconfirmed` | Inspect engine availability and remaining `agentci-preflight-` containers before retrying. |
| `service-not-ready` | Restore service dependencies and verify the configured origin. |
| `live-test-budget-not-authorized` | Obtain authorization and configure the total spend limit. |
| `credential-file-unavailable-or-insecure` | Fix the referenced file's existence, readability, size or permissions. |
| `provider-endpoint-not-authorized` | Use the exact documented provider origin. |
| `endpoint-unavailable` | Resolve connectivity/rate-limit/server failures and retry the diagnostic. |
