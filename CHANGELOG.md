# Releases

## 0.1.0-m0 — 2026-10-03

M0 contracts release. Includes AgentProject, requirement, finding and evidence
JSON Schemas; shared strict validation; CLI; local API skeleton; trace mapping;
source-linked implementation inventory; tests and deterministic contract evals.

The npm archive contains compiled JavaScript, declarations and schema assets.
It requires Node.js >=22.17 and production npm dependencies; the installed CLI
does not require TypeScript or tsx. This milestone cannot analyze PRs, publish
Checks, execute behavioral evals, or persist evidence.

Temporal is recommended for M1 orchestration and is not a runtime dependency.
