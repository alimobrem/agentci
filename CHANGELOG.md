# Releases

## 0.3.0-m2 — release candidate

Not yet published or milestone-complete; see [M2 readiness](docs/releases/m2-readiness.md).

- Strict EvalSuite contracts, impact/requirement selection and frozen baseline/head comparisons.
- Isolated native/pytest runners, optional Promptfoo/DeepEval and registered HTTP adapters.
- Scenario normalization, repeated trials, pass/critical thresholds and Wilson intervals.
- Durable scoped eval units, controller/evaluator recovery, cancellation and stale-head fences.
- Authenticated comparison API/client and bounded identity/digest-verified streaming exports.
- Trusted hosted behavioral self-review with retained exact-head failure and passing recovery evidence.
- Docker-default UBI evaluator packaging, six-role image publication and native download acceptance infrastructure.
- Bounded verified snapshot reuse; recorded timings do not imply proven total delivery acceleration.

## 0.2.1-m1 — 2026-10-03

- Empty-project initialization and configurable customer-owned GitHub App setup.
- Agent evidence client with identity/digest verification and typed errors.
- Fresh-customer success, invalid-input failure and automatic recovery checks.
- Native downloaded-image and installed-agent API verification. Publication and
  final completion evidence are recorded in the release assets and gate ledger.


## 0.2.0-m1 — 2026-10-03

- Deterministic immutable-commit semantic diff and advisory risk CLI.
- Signed scoped GitHub webhook API, transactional PostgreSQL outbox/evidence,
  Temporal workflow and least-privilege GitHub Check adapters.
- Versioned OpenAPI contract, API/adapter tests, risk corpus and durable-service
  integration tests; non-root UBI API/worker packaging and local demo/setup guide.
- Repository-only GitHub App verified on live PRs; trusted GitHub-hosted review
  retains evidence before publishing Checks and reconciles open PRs.
- Immutable public GitHub prerelease and public multi-platform UBI service images;
  anonymous download/install verification, native platform smoke and live
  success/failure/recovery demo. [Release record](docs/releases/m1.md).

## 0.1.0-m0 — 2026-10-03

M0 contracts release. Includes AgentProject, requirement, finding and evidence
JSON Schemas; shared strict validation; CLI; local API skeleton; trace mapping;
source-linked implementation inventory; tests and deterministic contract evals.

The npm archive contains compiled JavaScript, declarations and schema assets.
It requires Node.js >=22.17 and production npm dependencies; the installed CLI
does not require TypeScript or tsx. This milestone cannot analyze PRs, publish
Checks, execute behavioral evals, or persist evidence.

Temporal is recommended for M1 orchestration and is not a runtime dependency.
