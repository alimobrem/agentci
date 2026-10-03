# AgentCI status

2026-10-03: M0 is complete, including GitHub publication and asset verification.
Public source: https://github.com/alimobrem/agentci.
Release: https://github.com/alimobrem/agentci/releases/tag/v0.1.0-m0.
The source and tag are pushed, the prerelease is published, and downloaded
package/manifest assets match the verified local artifacts byte for byte.
Verification is recorded in [docs/releases/m0.md](docs/releases/m0.md).
Live requirement coverage is in
[specs/implementation-status.md](specs/implementation-status.md).

Delivered: four versioned schemas, CLI validation, API skeleton, trace mapping,
source-linked inventory, tests, contract evals, compiled package and release docs.
M1 is in progress; M0's GitHub release gate has passed. Local M1 preview code
includes semantic diff/risk, signed scoped webhook ingestion, PostgreSQL evidence,
Temporal orchestration and GitHub Check adapters. Unit/API tests, deterministic
risk cases, real local persistence/workflow tests and compiled containers have
verification evidence. See [M1 setup/demo](docs/m1-setup.md).

M1 is not complete. App installation, a reachable webhook, real advisory Checks
on AgentCI PRs, CI on the release SHA, scan disposition, GHCR publication/download
verification and the release/demo gates remain open. M2 is not-started.

Run `npm run check` for TypeScript, tests, contract evals, repository validation and
status freshness. API tests need loopback access. Run the packaged CLI smoke test
as documented in the development guide before any new release. Follow
[the definition of done](docs/definition-of-done.md) and milestone-specific gates
before reporting new work complete. M1 onward also requires recorded CI
results and published service-image verification.

The official Temporal SDK is installed; local development orchestration has been
tested. Production Temporal deployment remains undecided. See docs/architecture.md.
The supplied spec is preserved at the root and copied to specs/agentci-full-spec.md.
No earlier cloud M0 source was imported.
