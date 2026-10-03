# Milestone completion gates

There are 11 phases, M0 through M10, in specification section 40. Do not begin a
subsequent phase until the current phase passes its complete applicable gates.
This expands completion validation as requested by the user; it does not move
future feature implementation into earlier milestones.

Each milestone must have its specification scope and acceptance criteria mapped
to status/evidence, all relevant deterministic tests and evals passing, build and
package verification from a clean installation, dependency checks, updated usage
and operations docs, release notes, a versioned release artifact with checksum,
and a recorded release identity. Record inapplicable eval classes with reasons.
Infrastructure failure, unrun checks and skipped applicable gates never count
as success. Feature-level deferred work needs explicit rationale; deferred exit
criteria do not satisfy phase completion.

| Phase | Scope | Product exit |
| --- | --- | --- |
| M0 | Repository and contracts | CLI validates repository; schemas tested |
| M1 | Semantic PR review | Advisory AgentCI check on every AgentCI PR |
| M2 | Eval orchestration | Behavioral deltas and regressions in PRs |
| M3 | Multi-model review | Independent provider review; claims labeled |
| M4 | Instrumentation | Own model/tool operations traced |
| M5 | MCP Gateway | Tool invocations visible and enforceable |
| M6 | Release evidence | Exact verified release inputs reconstructable |
| M7 | Tekton/OpenShift | Sample PR to signed AgentRelease evidence |
| M8 | Production feedback | Seeded failure creates linked incident |
| M9 | Replay/regression | Seeded incident becomes permanent regression |
| M10 | Repair orchestration | Seeded incident creates verified repair PR |

M0 evals are deterministic validation-contract scenarios. Model-behavior evals,
PR risk corpora and runner execution are inapplicable until their features exist.
Completion requires source and version tag pushed to the configured GitHub
repository, a published GitHub release with notes and downloadable artifacts,
and verification that the uploaded artifacts match the local checksums. A local
tag/archive is a release candidate and does not close a phase.

Deployable service milestones also require applicable OCI images to be built,
tested, scanned and published with immutable digests. M0's CLI/contracts scope
does not require an image. M1 introduces the API/worker deployment boundary and
must include its container packaging before completion.
