# M1 customer onboarding release

Completed release: [v0.2.1-m1](https://github.com/alimobrem/agentci/releases/tag/v0.2.1-m1),
immutable source `b25931cb4fc484e5f55139e01bd8825432191fd6`, 2026-10-03.
This extends the original immutable `0.2.0-m1`; original artifacts remain intact.

The released CLI initializes an empty project and configures a customer-owned
private App for exactly one repository. Customers use advisory GitHub Checks;
agents use the authenticated evidence API and `agentci/client`. The
[customer guide](../customer-onboarding.md) describes operator prerequisites,
ports, secrets, published-image deployment and supported API operations.

## Verification

- [Full CI](https://github.com/alimobrem/agentci/actions/runs/37178131543): 66 tests,
  two real PostgreSQL/Temporal integration tests, 14 deterministic evals, API
  compatibility, clean packaging, image runtime and dependency scans passed.
- [Publication](https://github.com/alimobrem/agentci/actions/runs/37178142545): public
  UBI API/worker images for linux/arm64 and linux/amd64; four scans, zero known findings.
- Anonymous immutable image pulls passed natively on arm64 and
  [amd64](https://github.com/alimobrem/agentci/actions/runs/37178345111), including
  authentication/signature failures, persistent Temporal restart and graceful shutdown.
- All six public release assets were downloaded without authentication and matched
  SHA256SUMS, manifest and uploaded bytes. A clean production-only installation of
  that download initialized/validated a fresh project and ran the live evidence client.
- The actual customer App registration used the preceding candidate package.
  Its compiled init/setup/client modules are byte-identical to this release;
  generated bootstrap files match the fresh public customer repository baseline.

## Released-build demo

[Customer PR #1](https://github.com/alimobrem/agentci-onboarding-demo/pull/1) remains
unmerged. An intentionally unsupported permission action on head `7cb4b43`
produced [action required](https://github.com/alimobrem/agentci-onboarding-demo/pull/1/checks?check_run_id=111365824286)
and zero successful evidence records. Correcting it on head `2178f60` automatically
produced [high risk](https://github.com/alimobrem/agentci-onboarding-demo/pull/1/checks?check_run_id=111365993296),
including a verified explicit production-write finding. The fixture grants no access.

The installed release client verified canonical digest and exact repository,
PR/base/head identity; invalid credentials returned 401 and a wrong expected head
was rejected. Evidence ID: `d1a850fb-6967-4787-ace4-ef197fe56d32`.
The user received success and failure screenshots and links at phase completion.

[Hosted self-review](https://github.com/alimobrem/agentci/actions/runs/37178143884)
used trusted code at the release source, reviewed AgentCI PR #4 and retained
artifact `11294160894` before publishing its advisory Check. This dogfood path
runs independently of the laptop; artifact retention is 90 days.

The original App remains restricted to alimobrem/agentci. The separately approved
private customer App (5182307, installation 167710386) remains restricted to
alimobrem/agentci-onboarding-demo, with Contents/Pull requests/Metadata read and
Checks write. New credentials remain private/local.

## Evidence and limits

[Manifest](../../releases/m1-onboarding-manifest.json),
[CI](../../releases/m1-onboarding-ci.json), [images](../../releases/m1-onboarding-images.json),
[demo](../../releases/m1-onboarding-demo.json),
[distribution](../../releases/m1-onboarding-distribution.json),
[completion ledger](../../releases/m1-gates.json), [retrospective](../retrospectives/m1.md).

M1 is deterministic advisory review. Behavioral execution starts in M2. Customer
hosting uses a temporary development tunnel and persistent Temporal development
server; production hosting/backup/uptime are outside this release claim. The
security asset documents static scanning limits for native vendor artifacts.
Prior source `15232` preflight proof is retained separately and does not substitute
for final release-source verification. M0 was independently rechecked; its early
release lacks GitHub immutable enforcement, documented in `releases/m0-reaudit.json`.
