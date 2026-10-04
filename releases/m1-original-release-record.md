# M1 release verification record

State: complete. Version: `0.2.0-m1`. Date: 2026-10-03.
M2 remains not-started pending the user retrospective discussion.

[Immutable public prerelease](https://github.com/alimobrem/agentci/releases/tag/v0.2.0-m1).
Tag `v0.2.0-m1` identifies released source
`620230fd49d09e788d9a6a2783b57428882f5927`.
[Manifest](../../releases/m1-manifest.json), [completion gates](../../releases/m1-gates.json),
[distribution verification](../../releases/m1-distribution.json).
Post-publication completion records and the native-download verification workflow
on main do not change this immutable released build.

## Scope and correctness

M1 completes the explicit section 40 build/exit scope, trace IDs
`SPEC-40-013` through `SPEC-40-029`: repository-scoped GitHub App, signed webhook,
immutable base/head resolution, semantic diff, deterministic risk, advisory Check
and evidence, including all six listed semantic categories and every-PR dogfood.
The broad inventory contains source prose and provisional planning assignments;
those estimates do not add all unfinished product features to M1 or certify them.
Product requirements outside this scope remain open where not implemented.

[Release-source CI](https://github.com/alimobrem/agentci/actions/runs/37162124129)
passed 60 unit/API/adapter tests, two real PostgreSQL/Temporal integration tests,
and 14 deterministic evals (six contract, eight risk; threshold 100%). It also
passed clean locked installation/build/package smoke, workflow lint with a
negative regression, OpenAPI/schema/shared-fixture validation and oasdiff
compatibility with an endpoint-removal negative test. All four control operations
have contract/behavior coverage. Integration verifies replay, durable outbox,
immutable PR-scoped evidence, publication locking, retries and stale-head fences.
The [source CI bundle](../../releases/m1-ci.json) is a build-time record: its then-open
publication gates are closed by this later completion record, not rewritten.

## Packages, images and distribution

All six published release assets were anonymously downloaded and matched their
checksums: npm archive, manifest, demo record, security disposition, verification
archive and SHA256SUMS. The downloaded production-only package installed cleanly;
its actual CLI passed the positive and negative demo. Package SHA-256:
`c60ae3d03ed4f226815b1cf9fc24392c61373d1beac7a03be29b02e66cacf49b`.

Public service images, supported on linux/arm64 and linux/amd64:

- API: `ghcr.io/alimobrem/agentci-api@sha256:35ff1317c2b91aa39be4289e7a0ccc8427611aadd69ac5a24f416db3497b5063`
- Worker: `ghcr.io/alimobrem/agentci-worker@sha256:c1dc99cd51b7490e1033362e30e14c7e967e09e659f73aaeaae1faa1a4186a88`

Anonymous pulls and OCI source labels were verified. Native arm64 and
[native amd64 downloaded-image smoke](https://github.com/alimobrem/agentci/actions/runs/37163050220)
passed non-root startup, readiness, signature rejection, evidence authentication,
persistent Temporal startup/restart and graceful shutdown. UBI 10 amd64 requires
x86-64-v3; Mac amd64 emulation failed that requirement and was followed by the
successful native supported-CPU test.

[Publication](https://github.com/alimobrem/agentci/actions/runs/37162134891) scanned
both services on both platforms with zero known findings. See the
[security disposition](m1-security.md) for native-binary coverage limits.
Runtime: checksum-verified Node 26.10.0 Current, npm 12.2.0, TypeScript 7.0.2;
UBI 10 minimal pinned by digest; PostgreSQL 18.6; official Temporal SDK 1.24.0.
Dependency currency does not eliminate future maintenance.

## Live acceptance demo and operations

[Released-build success, failure and recovery demo](../dogfood/m1-release-demo.md)
shows a real signed webhook, the published worker, persisted authenticated
evidence and advisory Check. Invalid input produces action_required / CLI exit 2.
Synthetic permission data grants no actual access and demo PR #2 was closed.

Trusted GitHub-hosted review uses only main code and the App installed solely on
alimobrem/agentci. PR events, main updates, manual dispatch and recovery schedule
cover every PR without depending on a temporary laptop tunnel. Evidence uploads
precede neutral Check publication. Hosted artifacts require GitHub authentication
and expire after 90 days; the release archive preserves these demo observations.
[Setup, recovery and limits](../m1-setup.md).

This is advisory deterministic review, not behavioral correctness or a production
SaaS release. Behavioral eval execution is M2. Local Temporal remains a development
server; production topology, retention and backup automation remain future work.
All 16 M1 gates have source-linked evidence. M0's historical release is preserved.
[Retrospective and next-phase proposals](../retrospectives/m1.md).
