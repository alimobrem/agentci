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
The original M1 scope was completed: public immutable [v0.2.0-m1](https://github.com/alimobrem/agentci/releases/tag/v0.2.0-m1)
at source `620230fd49d09e788d9a6a2783b57428882f5927`. All 16 completion gates have
source-linked evidence. Release-source verification passed 60 tests, two real
PostgreSQL/Temporal integration tests and 14 deterministic evals. All six public
assets were downloaded and checked; public UBI API/worker images passed native
arm64 and amd64 downloaded-image smoke. See [the release record](docs/releases/m1.md).

The repository-only App runs advisory checks through trusted GitHub-hosted code,
with retained evidence uploaded before publication. The released-build
[demo](docs/dogfood/m1-release-demo.md) shows a verified production-write finding,
an action-required failure and recovery. Local evidence authentication returned
401/200 as expected. The local worker is stopped after the demo; hosted dogfood
continues independently of the temporary tunnel.

M2 is in-progress. The M1 extension retrospective is complete and its development
actions are adopted under the user's instruction to build all phases.
Broad inventory milestone assignments remain provisional; only explicit M1
section 40 build/exit requirements are closed by this release.

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

Development workflow: [small tasks, fast checks, cached CI, release gates and
measurement](docs/delivery-workflow.md). Run `npm run check:fast` for local feedback
and `npm run delivery -- report` for measured progress. Requirement inventory and
phase completion gates remain authoritative; feedback timings are not a claim
of total delivery acceleration.

## Customer acceptance extension

M1 customer onboarding is complete in immutable public
[v0.2.1-m1](https://github.com/alimobrem/agentci/releases/tag/v0.2.1-m1), source
`b25931cb4fc484e5f55139e01bd8825432191fd6`. All 18 gates passed: final-source
66 tests, two integration tests, 14 evals, API compatibility, clean packaging,
four zero-known-finding scans, both native downloaded image platforms, six
anonymous release-asset downloads and installed CLI/client verification.
The separate approved customer repository demonstrated real failure/recovery and
exact-identity authenticated evidence. Success/failure demo screenshots and links
were delivered to the user. [Release record](docs/releases/m1-onboarding.md).
Original App access remains only agentci; customer App only agentci-onboarding-demo.
M1 closure is synced. M2 planning and phase-isolated gates are complete. The UBI
native/pytest runner passed full CI, real integration, clean packaging and all
three zero-finding image scans; runner acceptance is closed. Model matrix and
suite-change planning passed that CI. Fixed baseline assertion provenance and
repeated/model-matrix execution passed exact-source full CI (91 unit/API/domain
tests, four real integration tests, zero skips), with verified artifact digest
and matching candidate/CI trees. Their task acceptance is closed. Optional
Promptfoo/DeepEval and HTTP adapters passed full CI 37184676873: 97 unit/API/domain
tests, five real integration groups, zero skips, compatibility against released
M1 and clean packaging. The prior failed cleanup attempt remains recorded.
Default service/runner scans report zero findings; the optional engine image has
an unpatched node-forge HIGH finding requiring release assessment. No clean scan
or M2 release claim is made.

Durable storage, unit execution, orphan recovery and restricted configuration
passed exact-source full CI 37187767466: 99 unit/API/domain tests, seven real
integration groups, zero skips, released-M1 API compatibility, clean production
packaging and verified artifact hashes. The first failed cleanup attempt is
retained; exact unit ownership assertions passed the corrected run.

The separate Temporal worker passed exact-source full CI 37188454333: 99 unit/API/domain tests, nine real integration groups, zero skips, immutable-M1 API compatibility and verified artifact hashes. Native AMD64 confirms restricted startup, committed-trial retry, cancellation cleanup, shutdown recovery and history replay.

New HTTP retry identity, actual cleanup-refusal recovery and one-time migration checks pass ten local integration groups. Broader concurrent execution exposed a repeat-trigger-DDL deadlock; both failed attempts are recorded and migration acceptance was reopened. Applied migration/body checksum verification now avoids changing live triggers and rejects altered SQL. Provider trials reuse stable IDs before checkpoint commit and issue no request for retained observations. These changes still need full CI. Published eval-worker packaging, durable PR/API integration and all M2 release gates remain open. The CI database URL cleanup remains in the open M2 PR, not GitHub main.
[M2 acceptance plan](docs/phases/m2.md).
