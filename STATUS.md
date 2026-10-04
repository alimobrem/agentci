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

HTTP retry identity, cleanup-refusal recovery and corrected checksum-bound migration setup passed full CI 37189503876: 100 unit/API/domain tests, ten real integration groups, zero skips, released-M1 API compatibility, clean packaging and verified artifact hashes. The prior setup failures and acceptance reopening remain recorded. Their small-task acceptance is complete; the milestone remains open.

The new UBI eval-worker image passes local native arm64 restricted startup, real Temporal/isolated-child execution, failure reporting and shutdown/restart. Its detected inventories have zero known findings; Docker CLI module and Temporal vendor-binary coverage limits remain for release assessment. Exact-source native AMD64 CI 37190707698 now passes the new image probe, all 100 unit/API/domain tests, ten real integration groups, compatibility and packaging; artifact hashes and source tree are verified. Published downloads, durable PR/API integration and all M2 release gates remain open. The CI database URL cleanup remains in the open M2 PR, not GitHub main.
[M2 acceptance plan](docs/phases/m2.md).

Impact-required selection gaps passed full CI 37191102179: 103 unit/API/domain tests and ten real integration groups, zero skips, source-tree and artifact verification. The selection task is accepted. Durable comparison evidence now passes local strict-contract checks and real PostgreSQL/runner tests; final-source CI, authenticated API/client access and PR publication remain pending.

Comparison resource acceptance passed verified full CI 37191703149 (106 unit/API/domain tests, ten real integration groups, zero skips). Additive authenticated comparison API/client work now passes local checks, released-M1 compatibility, real database/runner HTTP consumption and production-only package smoke. Final-source compiled-container CI, large-response capacity, PR staging/publication and all release gates remain open.

Inline API/client acceptance passed verified full CI 37192449344 (110 unit/API/domain tests, ten real integration groups, zero skips; compiled API and installed package probes). Snapshot export now passes local large-record, hash-chain, complete-traversal, concurrent-cancellation and abandoned-stream tests with real persistence and isolated runners. Final-source export CI, PR orchestration/publication and all M2 release gates remain open.

Snapshot export passed verified full CI 37193637907: 114 unit/API/domain tests, ten real integration groups, zero skips, immutable-M1 compatibility, installed-package and compiled-container probes. The source tree and every declared artifact hash are verified in `releases/m2-comparison-export-ci.json`; the capacity task is accepted. PR staging now has local real HTTP Git/PostgreSQL acceptance for exact commits, frozen baseline/model expansion, immutable attempt retries/conflicts, zero-unit coverage gaps and sanitized SDK failures. Parent workflow registration, live PR publication and all M2 release gates remain open.

PR staging passed source-verified full CI 37194473084: 117 unit/API/domain tests and eleven real integration groups, zero skips, compatibility, packaging and container probes. The staging small task is accepted. A new lifecycle parent now passes local real Temporal/PostgreSQL/isolated-container tests for frozen baseline/head regression, deterministic child IDs, cancellation during committed staging, running stale-PR cleanup, child failure, history replay and preserved M1 replay. Final-source parent CI, production controller registration, locked GitHub Check publication, termination/deadline recovery and all M2 release gates remain open.

PR parent lifecycle passed source-verified full CI 37195091714: 117 unit/API/domain tests and twelve real integration groups, no skips, compatibility, packaging/container probes and verified artifact hashes. Its small task is accepted. Bounded behavioral Check publication now passes local real HTTP GitHub-fixture/PostgreSQL/runner acceptance: ambiguous write retry, current-head race checks, shared cancellation/publication lock, explicit gaps/failures, exact App/head/attempt reconciliation and recovery. Shared client/export validation, late-regression display, compatibility and installed package probes pass. Production controller wiring, live App/customer PR, final-source publication CI and all M2 phase release gates remain open.

Publication CI 37196037347 failed on missing initialization in a fresh CI test database; its failed attempt is retained. Fixtures now initialize through Store.ready. The compiled M2 controller is wired to a full deterministic outbox workflow with semantic/progress/behavioral Checks and durable evaluation deadlines. All fourteen local native integration groups pass without skips, including fresh signed-webhook-to-Check acceptance, duplicate-start fencing, failure/fresh-attempt recovery, late-publication cancellation, M1/new-parent replay and isolated runners. Local UBI API/controller startup/shutdown, immutable-M1 API compatibility and installed package/client/template probes pass. Final-source CI, live customer App/reliable every-PR acceptance, termination/retry UX and all M2 release gates remain open.

Controller CI 37198555724 failed because parent cancellation awaited the fail-fast aggregate rather than every child terminal result. The failed attempt is preserved; M2-PR-PARENT is reopened. Cleanup now retains and awaits every child promise, and regression acceptance requires both real child containers running before cancellation/stale detection. All fourteen native integration groups passed locally with the implementation fix, zero skips; immutable M1 API compatibility and fast feedback passed. Final strengthened regression and fresh full CI remain required; no M2 milestone gate is closed by these local results.

The strengthened real two-child cancellation/stale cleanup regression passed locally (one integration group, zero skips, replay included). Evidence is recorded in releases/m2-child-cleanup-local.json. Fresh exact-source full CI is required before reaccepting the parent/controller/publication tasks.

A tracked M2-DEPLOYMENT candidate adds a separate evaluator Compose bundle with an explicit environment allowlist, restricted SQL login, private provider file, socket group and read-only runtime restrictions. Both dedicated and development-network configurations render successfully without synthetic inherited controller credentials or App key mounts. Configuration verification is now mandatory in CI. The customer operator guide distinguishes temporary colocated demo wiring from dedicated production evaluator infrastructure. Local render evidence is in releases/m2-deployment-local.json; real deployed customer acceptance and final-source CI remain open.

A separate local M2 customer stack now runs on API 3003 and Temporal UI 8235, preserving existing M1 services. Its own PostgreSQL/Temporal instance and a separately authenticated restricted evaluator started successfully. API health reports 0.3.0-m2; controller and evaluator poll successfully with zero restarts, and actual evaluator environment/key mounts exclude App credentials. Sanitized startup evidence is releases/m2-customer-startup-local.json. Local Docker VM testing exposed that host /tmp is not shared; private provider files now use a Git-ignored shared path, and the deployment candidate refuses automatic creation of missing bind paths. Real customer PR results/recovery, final CI and release/demo remain open.

Source-verified CI 37199405414 passed 119 unit/API/domain tests and fourteen real integration groups with zero skips, immutable M1 API compatibility, installed package acceptance, UBI service scans/probes and the separate evaluator runtime probe. Candidate tree cbd0ec9 and artifact 11301883956 (SHA256 2be90d198a1a8f686b374249553536461b1ba17956e9fcd9872b2a8bc9b10cb1) are verified in releases/m2-pr-controller-ci.json. The reopened parent task plus publication/controller component tasks are accepted. The subsequent bind-path guard and live customer acceptance remain in progress; all M2 milestone gates remain open.

Real customer demo PR2 received signed App events through the temporary M2 tunnel. Both the original regression head and a subsequent head that replaces assertions with process.exit(0) and lowers passRate to 0 still report baseline 2/2 passed, head 0/2 passed, frozen base threshold 1 and a retained safe-response regression. Authenticated inline and complete streaming client evidence, anonymous/wrong-token denial and identity mismatch passed; proof is releases/m2-customer-behavior-local.json. CI 37199803550 failed because Compose JSON serialization may omit explicit false bind options; the verifier now checks the source declaration and rejects rendered true while accepting an omitted false. The failed attempt is retained; final-source CI and live failure/recovery remain open.

Live customer failure/recovery passed: an operator runner identity mismatch produced action_required with retained cancelled evidence; restoration plus a fresh actual signed reopen delivery on the same repaired head passed both baseline and head trials. Client inline and complete exports verified both retained attempts. Proof is releases/m2-customer-recovery-local.json and the development demo is docs/demos/m2-development.md. The demo exposed default latest-only GitHub Check lookup hiding prior attempts: M2-PR-PUBLICATION is reopened, a dogfood-defect event records the finding, and explicit all-attempt reconciliation now passes local 119-test fast feedback plus all fourteen native groups without skips. Deployment source 79f5b32 passed fully hash/tree-verified CI 37200498655; subsequent reconciliation fix needs fresh CI. M2 phase gates remain open.

Check-history reconciliation passed source- and artifact-verified CI 37201053254: 119 unit/API/domain tests, fourteen native integration groups, zero skips, compatibility, packaging and UBI probes/scans. M2-PR-PUBLICATION component acceptance is restored with releases/m2-check-history-ci.json. The tracked M2-OPERATOR-RETRY candidate adds a private operator review command; local fast feedback, fourteen native groups and production-only package smoke pass. The installed CLI requested fresh attempt 80fb3814-ae0f-432b-a201-eef05c68aeb3 on the unchanged open customer PR2, with passed baseline/head trials and exactly one Check after an identical duplicate submission. Installed client inline and complete export verification retain earlier failed/recovered attempts. Sanitized proof is releases/m2-operator-review-local.json. Final-source full CI is still required for command acceptance; no M2 phase/release gate closes from these local results.

Operator command source ea56a7f passed full CI 37202131590: 122 unit/API/domain tests and fourteen native integration groups with zero skips, released-M1 compatibility, packaging and UBI runtime/scans. Artifact 11303342510 (SHA256 42a3a8d65067d66307f4bc9bfffc9f27a640028d25c63689bdadae02b7b13a5a) and candidate/CI trees are verified in releases/m2-operator-review-ci.json; installed customer proof is linked there. M2-OPERATOR-RETRY component acceptance is complete. A read-only customer API audit then found schema-valid uppercase comparison UUIDs return inline 503 while export returns 200; releases/m2-uuid-case-finding.json retains the observations, a dogfood-defect event is recorded and M2-COMPARISON-API is reopened. No fix or release acceptance is claimed for that defect; M2 phase gates remain open.

The reopened comparison API task now has a UUID correction candidate. HTTP lookup normalizes only the request key, storage emits the canonical database job ID, and client/export identity comparison accepts valid spelling variants without rewriting payloads or hashes. A strengthened native regression exposed an additional unit/job spelling check, which now uses the canonical stored job ID; all fourteen native groups then passed without skips. Local fast feedback and released-M1 API compatibility pass. The production-only installed client and isolated UBI API candidate now read the originally failing actual customer comparison for either spelling with inline 200, unchanged digest and identical complete export frames. Wrong attempt and anonymous access remain rejected. Proof is releases/m2-uuid-case-local.json; final-source full CI remains required before API reacceptance or any phase claim.

UUID correction source 06f5410 passed full CI 37202994401: 123 unit/API/domain tests, fourteen native integration groups, zero skips, released-M1 compatibility, installed packaging and UBI runtime/scans. Artifact 11303856470 (SHA256 97fe5c49fc723d652371c8934951ea52ee21afa2a2ff4f42fd0cbaaf27f497bc), candidate/CI tree and declared file hashes are verified in releases/m2-uuid-case-ci.json. M2-COMPARISON-API acceptance is restored, preserving the reopen/rework events. M2-TERMINATION-RECOVERY is started with observable native parent-termination, evaluator SIGKILL, scoped orphan cleanup, fenced controller reconciliation and fresh-attempt criteria. The existing dispatcher only acknowledges starts; an independent durable closure reconciler remains required. M2 remains in progress with all eighteen phase gates open.
