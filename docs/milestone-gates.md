# Milestone completion gates

There are 11 phases, M0 through M10, in specification section 40. Do not begin a
subsequent phase until the current phase passes its complete applicable gates.
This expands completion validation as requested by the user; it does not move
future feature implementation into earlier milestones.

The [definition of done](definition-of-done.md) is the release-completion policy.
The table below adds each milestone's product acceptance scenario. Both must pass.
Requirement status, milestone status, and product readiness are distinct.

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

For M1 onward, record the acceptance scenario, tests/evals, CI, scans, clean
package/image verification and published-release evidence before marking complete.
M0's historical evidence remains in [its release record](releases/m0.md).
