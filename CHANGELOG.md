# Releases

## Unreleased — M1 development candidate

- Deterministic immutable-commit semantic diff and advisory risk CLI.
- Signed scoped GitHub webhook API, transactional PostgreSQL outbox/evidence,
  Temporal workflow and least-privilege GitHub Check adapters.
- Versioned OpenAPI contract, API/adapter tests, risk corpus and durable-service
  integration tests; non-root UBI API/worker packaging and local demo/setup guide.
- Repository-only GitHub App verified on live PRs; trusted GitHub-hosted review
  retains evidence before publishing Checks and reconciles open PRs.
- M1 release and GHCR publication remain pending.

## 0.1.0-m0 — 2026-10-03

M0 contracts release. Includes AgentProject, requirement, finding and evidence
JSON Schemas; shared strict validation; CLI; local API skeleton; trace mapping;
source-linked implementation inventory; tests and deterministic contract evals.

The npm archive contains compiled JavaScript, declarations and schema assets.
It requires Node.js >=22.17 and production npm dependencies; the installed CLI
does not require TypeScript or tsx. This milestone cannot analyze PRs, publish
Checks, execute behavioral evals, or persist evidence.

Temporal is recommended for M1 orchestration and is not a runtime dependency.
