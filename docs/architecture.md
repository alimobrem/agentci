# Architecture choices

2026-10-03; M0 implementation and recommendations for M1.

Implemented: TypeScript for CLI/API and shared validation, Node.js >=22.17,
JSON Schema draft-07, Ajv with formats, and YAML parsing. Validators do not coerce,
remove fields, insert defaults, or execute repository code. Strict core objects
catch misspellings; namespaced extensions allow provider capabilities. Independent
project/evidence schema versions start at v1alpha1.

The API is a loopback-only development skeleton with health, schema retrieval,
and document validation. Persistence, tenancy, authentication, webhooks, and GitHub
publishing are future work. Implement those controls before hosting the service.

Recommended: Temporal for durable orchestration starting with M1 PR review.
Discussed with the user; no deployment or SDK is added to M0. AgentCI needs retries,
cancellation on new PR heads, parallel eval/reviewer steps, external CI completion,
approval waits, and long-running incident/repair flows. Workflows carry immutable
commit/artifact references; activities perform external I/O and must be idempotent
because retries can repeat effects. Only results for the current head SHA may
satisfy its gate. Test workflow versioning and recovery before required checks.

Temporal coordinates; isolated native runners, GitHub Actions and Tekton execute
jobs. PostgreSQL holds control metadata and evidence relationships; object storage
holds large artifacts; external OTLP backends store traces. Workflow history is
not the evidence API. Keep raw sensitive payloads out of history using references
and controlled artifact storage. Core domain contracts remain free of Temporal
imports. Start with a local development service; Cloud versus production
self-hosting remains open. SaaS, hybrid and self-hosted support remain required.

Alternative: pg-boss provides durable jobs using PostgreSQL and reduces operational
dependencies. It fits a smaller independent-job MVP. AgentCI's full workflow scope
favors Temporal to avoid building multi-step durable coordination ourselves. This
is an architecture assessment, not a performance benchmark.

Remaining recommended defaults: PostgreSQL evidence metadata, GitHub App with
least privilege and advisory checks first, deterministic structured policy rules
with optional OPA integration, and separate provider/CI adapters. During M1, choose
deployment packaging, database migrations, authentication, tenant model and
artifact backend. M0 does not implement them.

Sources: [Temporal workflows](https://docs.temporal.io/workflows),
[Temporal TypeScript SDK](https://docs.temporal.io/develop/typescript),
[pg-boss](https://github.com/timgit/pg-boss).
