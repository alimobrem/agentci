# M2 customer and release guide

Target version: `0.3.1-m2`. This candidate is not yet published or phase-complete.
The latest downloadable release remains M1 `0.2.1-m1`. Follow the
[readiness record](releases/m2-readiness.md) and [release gates](../releases/m2-gates.json)
before relying on a distribution claim. Infrastructure CI and local examples do
not replace anonymous downloaded-runtime or released customer acceptance.

## What a customer uses

Customers see separate semantic and behavioral advisory GitHub Checks on their PRs.
Operators use the CLI to initialize/validate projects, configure a repository-only
App and submit a review using private operator configuration. Agents use
`agentci/client` and the authenticated evidence/comparison API. There is no M2 web
dashboard or CLI `eval` command. The dashboard starts in M3; the API and GitHub
workflow are the current control-plane interfaces.

A behavioral result can be passed, failed, error, insufficient, pending or no-evals.
`no-evals` says no eligible evaluations were selected; it does not prove assertions
passed. `insufficient` says available evidence cannot meet the declared acceptance.
The Checks are advisory: a neutral GitHub conclusion can contain a failed evaluation.
Read the behavioral outcome, exact source/head/attempt and evidence rather than
interpreting Check color as deployment authority.

## Setup and execution

1. Use [customer onboarding](customer-onboarding.md) for a scoped App, signed
   webhooks and API/controller setup. Keep App access restricted to the intended
   repository. The original AgentCI App is not a shared customer credential.
2. Back up PostgreSQL, apply the M1 schema followed by `002_m2.sql`,
   `002_m2_eval_role.sql` and `003_m2_review_recovery.sql` with an administrator.
   Provision a separate restricted evaluator login. See
   [evaluator deployment](eval-deployment.md) for exact commands and boundaries.
3. Deploy API/controller and a separate evaluator with a dedicated Docker daemon.
   Pull immutable runner digests on that evaluator host. Untrusted children receive
   no controller/App credentials, database login or engine socket. The evaluator
   itself is trusted infrastructure with restricted database/Temporal access.
4. Configure suites and requirement/impact selectors using
   [adapter authoring](adapter-authoring.md). Default execution has no network;
   external models/providers require explicit trusted operator configuration and
   separately scoped evaluation access. Do not put credentials in repository suites.
5. Open or update a PR, or submit a fresh attempt with
   [`agentci review`](operator-review.md). Baseline assertions run against base and
   head code. Changed/removed suites, missing scenarios and coverage/selection gaps
   remain visible. An exit code of zero alone does not prove structured assertions.
6. Inspect the exact-head behavioral Check and retrieve its comparison through
   the [API/client](eval-comparison-api.md). Verify repository, PR, base/head,
   organization, review and attempt identity; consume the complete chained export.
   Truncated output or missing completion frames must not certify success.

CLI/private operator configuration and evidence bearer tokens have different
purposes. Keep both outside Git, logs and browser bundles. Service startup must
use the deployment's immutable images, not mutable PR-selected images. See
[image publication](image-publication.md) for the six roles and digest evidence.

## Recovery, upgrades and rollback

The [recovery guide](eval-recovery.md) covers controller/evaluator termination,
independent cleanup, cancelled units, retained observations and fresh attempts.
Repeating a terminal failed attempt UUID does not rerun it. Request a new review
attempt; ambiguous submissions can reconcile their original receipt. Superseded
heads cannot satisfy a current PR.

Upgrade after backing up the database and verifying additive migration checksums.
Pause new dispatch if an operator needs a controlled service transition; let owned
work settle or cancel it using the documented recovery procedure. Retain the
previous image/package digests and evidence. Roll back service images only with
verified schema compatibility; M2's additive schema is retained rather than
silently dropping observations. Restore a database backup only as an explicit
operator recovery with its associated loss of later data. Test upgrade/restart and
rollback on a disposable copy before claiming production acceptance.

Monitor API health/readiness, Temporal workflow state, controller/evaluator logs,
SQL recovery/lease state and behavioral outcomes. Infrastructure errors need their
own alerts; they are not assertion regressions or passing results. Existing
structured lifecycle logs and retained comparisons are available; full product
OpenTelemetry instrumentation is an M4 capability. A Docker container boundary is
not VM isolation against host-kernel vulnerabilities.

## Scope and acceptance map

| Primary requirement | Observable evidence |
| --- | --- |
| SPEC-40-031: eval manifest | `packages/evals/json/eval-suite.schema.json`, manifest/selection tests; [contract acceptance](../releases/m2-contract-acceptance.json) |
| SPEC-40-032/033: command and pytest | `tests/integration/eval-runner.test.ts`: actual pass/fail/no-tests/error, cancellation, deadline/output limits, frozen assertions and isolation |
| SPEC-40-034: optional engines | `tests/integration/eval-engines.test.ts` and HTTP recovery tests; installed engine formats, real execution and explicit provider identity. Published-platform security/distribution remains pending |
| SPEC-40-035: normalization | `tests/eval-adapters.test.ts`, contract acceptance and actual installed-engine integration; missing data and observations remain distinct |
| SPEC-40-036/037: statistics and comparison | `tests/eval-statistics.test.ts`, comparison/PR lifecycle tests and frozen self-evals; base/head scenario regressions and explicit thresholds |
| SPEC-40-039: PR behavioral deltas | [hosted regression](../releases/m2-hosted-regression-ci.json) and [actual passing recovery](../releases/m2-hosted-recovery-ci.json), retained exact-head App Checks; released customer replay still pending |
| Section 11 classes, selection, trials, adapters and normalized results | [phase requirement map](phases/m2.md), shared schema/API fixtures and source-verified native CI checkpoints |
| Packaging, security, publication, downloads and demo | [definition of done](definition-of-done.md), [M2 readiness](releases/m2-readiness.md), [native security](releases/m2-native-security.md) and the still-open M2 gate ledger |

Every release must retain final source/version, package hashes, six image digests,
per-platform scans/inventories and native runtime results, anonymous downloads,
real customer success/regression/infrastructure-failure/recovery, installed agent
API verification and the user demo. Earlier component evidence is not a substitute
for that final-source acceptance. Optional-engine backport/scanner boundaries and
Podman deferral stay explicit; no security finding is hidden by a green build.
