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
M1 has not started. M0's GitHub release gate has now passed.
AgentCI cannot review its own PRs yet.

Run `npm run check` for TypeScript, tests, contract evals, repository validation and
status freshness. API tests need loopback access. Run the packaged CLI smoke test
as documented in the development guide before any new release. Follow
[the definition of done](docs/definition-of-done.md) and milestone-specific gates
before reporting new work complete. M1 onward also requires recorded CI
results and published service-image verification.

Temporal is recommended for M1 and is not installed. See docs/architecture.md.
The supplied spec is preserved at the root and copied to specs/agentci-full-spec.md.
No earlier cloud M0 source was imported.
