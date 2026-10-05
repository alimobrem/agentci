# Delivery workflow and measurement

Work in milestone order. Use `delivery/tasks.json` for small tasks with spec IDs,
acceptance criteria and evidence; `specs/requirements.yaml` remains the full
implementation inventory. The task checker requires every M1 build/detection/exit
item to have a task. These tools organize development; they do not complete later
AgentCI product milestones or replace human evidence review.

## Daily development

Before the next phase, review the [phase/PR plan](phase-pr-plan.md). It sizes
M3–M10 into reviewable changes, records dependencies and acceptance, and lists
decisions needed before implementation. Its [ownership map](../delivery/phase-pr-plan.json)
is planning evidence, not implementation status. Validate it with
`node scripts/check-phase-pr-plan.mjs`; create tracked tasks only when starting
the corresponding work. Current phase release gates still precede later phases.

```sh
npm run check:fast
npm run delivery -- report
npm run delivery -- task TASK-ID start
npm run delivery -- task TASK-ID block "Specific external blocker"
npm run delivery -- task TASK-ID start
npm run delivery -- task TASK-ID accept 0 tests/example.test.ts
npm run delivery -- task TASK-ID done
```

Use actual task IDs and existing evidence paths. `accept` records an observed,
verified result; passing the task validator alone does not prove that result.
Add tasks to the board before starting new work. Never backfill unknown historical
start times. Task events are append-only observations in `delivery/task-events.jsonl`.
Task cycle time includes blocked/waiting time; it is elapsed delivery time rather
than active coding effort. Review blocker events separately when comparing tasks.

The fast runner concurrently executes all eight independent local checks: types,
unit/API/adapter/tool tests, OpenAPI/coverage/lock validation, contract evals, risk
evals, project validation, inventory freshness and task/release-record validation.
It retains output, failure status, runtime and source identity under
`.agentci/artifacts/delivery/fast-latest.json`. It does not run full integration,
compatibility downloads, containers, scans, packaging or publication verification.

GitHub CI has a separate fast-feedback job and a full contracts-and-runtime job.
The full job still runs integration, compatibility, packaging, images, scans and
runtime verification. Docker BuildKit caches API/worker layers separately using
GitHub's cache backend. A shared Trivy database is reused within the job, with one
full scan per image; the same report supplies the fixable high/critical policy.
Unfixed findings and scan coverage still require release review. Cancellation of
superseded CI runs prevents spending time on obsolete source.

## API changes

Shared protocol fixtures live in `tests/fixtures/control.ts`. Tests use the same
fixtures for HTTP, GitHub adapters and persistence/workflow integration. Every
control API operation maps to requirements and HTTP scenarios in
`specs/api/operations.json`; missing operation coverage fails the fast check.

```sh
npm run check:api:compat
```

This uses official checksum-verified oasdiff 1.33.0 binaries for macOS/Linux arm64
and amd64. It rejects breaking changes at WARN severity or above and verifies a
negative endpoint-removal case. External refs are disabled. The baseline is the
M1 candidate captured in `specs/api/baselines/m1-openapi.json`; M0 did not ship
this control API. After the first release, compare against its immutable contract.
Do not quietly update the baseline to hide a breaking change: record the version,
migration and review decision. Schema compatibility cannot detect every behavioral
change, so authorization, retry and negative-path tests remain mandatory.

## Phase closure

```sh
npm run release:check
npm run release:check -- --require-complete
```

The first validates the record and shows open gates. The second intentionally
fails until every applicable gate passes. `releases/m1-gates.json` covers 16 gates,
including live dogfood and both service image distributions. A passed gate needs
release-source evidence; mismatched SHAs, missing files, changed hashes, invalid
scope exceptions and incomplete gate sets fail validation. The checker validates
record integrity, not the truth of human assertions or availability of every
external link. Review the linked evidence before recording a pass.

Full CI uploads `verification.json`, fast-check output, API compatibility,
container-smoke results, package and full scan reports. The bundle identifies both
the tested checkout SHA and the candidate PR SHA; a PR merge-ref check must not be
misrepresented as a release-tag check. It does not automatically mark a milestone
complete. Registry downloads, release assets, operating instructions, a success
and failure demo, and explicit closure remain required.

## Measuring the improvement

`delivery/baseline.json` preserves measurements from before these workflow changes
on the Node 26 / UBI 10 stack: three local full-check samples and one successful
full CI job. Baseline full CI job duration is 140 seconds; sample count is small.
For each completed run (failed/cancelled attempts are retained for quality tracking;
only successful runs contribute to speed comparisons):

```sh
npm run delivery -- collect-ci RUN-ID optimized cold
npm run delivery -- collect-ci RUN-ID optimized warm
npm run delivery -- report
```

Run attempts are stored separately, so a successful rerun cannot erase a failure.
An optional fourth argument selects an older attempt explicitly.
Label cache state from build logs, not assumptions. The report compares the median
longest CI job duration with the baseline job duration. It reports local feedback
time separately, and task cycle times only where start/completion were observed.
This is not an estimate of total feature-delivery acceleration.

Track median/P90 feedback time, full CI duration, task elapsed time, blocked time,
first-pass CI success, reopened work and escaped defects as the sample grows.
Compare similar task scope and test coverage, separate cold/warm caches, and use
at least five successful CI samples per cohort before treating a trend as useful.
Target a 20% reduction in feedback time while preserving all completion gates;
the target is not a claimed result. Runtime upgrades, stronger tests and runner
variation confound before/after measurements. No historical task-delivery baseline
exists, so requirement delivery speed will be measured prospectively.

Sources: [Docker CI caches](https://docs.docker.com/build/ci/github-actions/cache/),
[oasdiff](https://github.com/oasdiff/oasdiff),
[GitHub workflow jobs](https://docs.github.com/en/rest/actions/workflow-jobs).

Record quality/rework observations instead of erasing them:

```sh
npm run delivery -- task TASK-ID reopen "Observed regression"
npm run delivery -- quality dogfood-defect SPEC-40-014 docs/dogfood/m1-first-check.md
npm run delivery -- quality escaped-defect REQUIREMENT-ID path/to/defect-record.md
```

Use actual IDs and proof paths. Reopening starts a new measured iteration and
retains earlier events. Quality counts cover recorded observations only; zero
recorded escaped defects is not proof that none exist. First-pass failure counts
use attempt 1 and retain failed runs separately from successful reruns.

## Initial development observations on 2026-10-03

| Measure | Before | After | Samples and interpretation |
| --- | --- | --- | --- |
| Same current local checks, sequential vs parallel | 2.07 s | 0.56 s | Three alternating runs per mode; 72.9% less feedback time |
| Full CI, first cache population | 140 s | 204 s | One run each; cold population was slower |
| Full CI, cache reuse | 140 s | 105 / 126 s; median 115.5 s | Two warm runs; median 17.5% shorter, preliminary |
| Separate fast CI job | No separate early result | 24 s cold / 19–17 s warm | Full verification remains required |

At this earlier checkpoint, two dogfood defects were recorded: the persistent Temporal volume startup issue,
and an evidence collector that initially listed historical manifests outside the
uploaded bundle. The latter was found by downloading artifacts and checking their
inventory; the collector now matches the upload paths. Do not count an artifact
bundle as download-verified until every listed file is present and its hash matches.
Source-identified records are in `delivery/runs/` and `delivery/local-feedback.json`.
The baseline and new CI suites differ (new compatibility, gate and persistent-volume
checks were added), so these observations do not isolate caching as the sole cause.

The corrected verification bundle from [CI run 37160392578](https://github.com/alimobrem/agentci/actions/runs/37160392578)
was downloaded; all three listed artifact hashes match. It passed 58 tests,
14 evals, real integration, packaging, compatibility and runtime verification.
The tested merge SHA and candidate SHA are separate in `delivery/ci-evidence.json`.
Workflow task closure does not close M1 release gates.

## M1 closure update

The release-source suite passed 60 tests, two real integration tests and 14 evals.
A third recorded dogfood defect was an illegal workflow environment context;
pinned actionlint and an intentionally invalid workflow regression now catch it
before publication. Later failed and successful attempts are preserved in
`delivery/runs/`; the expected-negative demo is a separate cohort.
The initial timing comparison above describes its then-current scope and does
not measure total M1 delivery speed. See [the retrospective](retrospectives/m1.md)
and `delivery/latest-report.json` for closure observations.

## Phase selection

The active phase is `delivery/tasks.json`'s milestone. Each phase has a separate
`releases/mN-gates.json`; M1 evidence remains immutable historical proof. Run
`npm run release:check -- --milestone M1 --require-complete` to audit M1 while M2
is active. The CLI verifies every section 40 build/exit bullet has a task and
rejects mismatched phase/version or missing customer acceptance.

## Agentic velocity plan refinement

[The planning addendum](agentic-velocity-plan.md) separates actionable feedback
from end-to-end accepted release time, includes failed/superseded compute and
human interventions, and proposes evidence reuse, merge-candidate validation and
burst-capacity experiments in their dependent milestones. Current tracking lacks
a comparable end-to-end baseline and complete cost/human-effort telemetry; no
acceleration claim is established. Measurement collection continues now, with
product analytics still unimplemented. Connected changes use focused development
checks and full integration/release checkpoints. Milestone order and release gates
remain in effect; discussion of parallel phases has not started M3.

## Reuse verified immutable evidence

Verify at the boundary that can introduce a new failure: CI build output,
published registry images, and public release downloads/installation. Retain the
source SHA, artifact digest, platform, verifier revision and observed results.
Once that scope passes, reuse the record for the same immutable inputs. A status
update or documentation edit alone does not justify downloading and executing the
same artifact again.

Rerun affected checks when product/build inputs or verifier coverage change, a
result is missing or inconsistent, a new security finding changes the assessment,
or another required platform/deployment boundary has not been exercised. Preserve
failed attempts and explain why a rerun was necessary. Documentation and ledger
changes receive focused checks; they do not invalidate an unchanged released
binary's runtime evidence. Required hosted checks still run under branch policy.

Observe a live job only when its result determines the next action. Continue
independent work while it runs and back off unchanged polling. Never restart a
job because an observation timed out. Track release critical-path time and
repeated verification overhead separately from local feedback speed.
