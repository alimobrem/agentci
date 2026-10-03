# AgentCI status

2026-10-03: M0 completion and local release are recorded in
[docs/releases/m0.md](docs/releases/m0.md). Live requirement coverage is in
[specs/implementation-status.md](specs/implementation-status.md).

Delivered: four versioned schemas, CLI validation, API skeleton, trace mapping,
source-linked inventory, tests, contract evals, compiled package and release docs.
M1 has not started. AgentCI cannot review its own PRs yet.

Run `npm run check` for TypeScript, tests, contract evals, repository validation and
status freshness. API tests need loopback access. Run the packaged CLI smoke test
as documented in README before any new release. Finish each milestone's tests,
applicable evals, packaging, docs and release before moving to the next.

Temporal is recommended for M1 and is not installed. See docs/architecture.md.
The supplied spec is preserved at the root and copied to specs/agentci-full-spec.md.
No earlier cloud M0 source was imported.
