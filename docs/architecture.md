# Architecture choices

2026-10-03; M0 release and M1 local candidate implementation.

Implemented: TypeScript for CLI/API and shared validation, Node.js >=22.17,
JSON Schema draft-07, Ajv with formats, and YAML parsing. Validators do not coerce,
remove fields, insert defaults, or execute repository code. Strict core objects
catch misspellings; namespaced extensions allow provider capabilities. Independent
project/evidence schema versions start at v1alpha1.

The M0 API remains a development skeleton with health, schema retrieval and
document validation. M1 adds a separate control API: signed GitHub webhooks,
installation/repository allowlisting, durable receipt/outbox and bearer-protected
evidence. PostgreSQL is bound to one organization/repository; shared multi-tenant
hosting is not implemented. The API contract is `specs/api/openapi.json`.

Adopted in the M1 local candidate: Temporal for durable PR-review orchestration.
No deployment or SDK was part of the immutable M0 release. AgentCI needs retries,
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

The M1 candidate uses PostgreSQL evidence metadata and an SQL initialization
migration, least-privilege GitHub App adapters and advisory Checks, deterministic
structured rules and explicit manifests, and non-root Red Hat UBI 9 Node.js 22
minimal API/worker images pinned by digest, as requested by the user. Review
activities fetch exact Git objects through the official Octokit SDK without
executing PR code. GHCR is the selected registry; publication and live App
installation remain pending. See `docs/m1-setup.md` for local configuration,
verification and current limits. OPA and object storage are not implemented.

Sources: [Temporal workflows](https://docs.temporal.io/workflows),
[Temporal TypeScript SDK](https://docs.temporal.io/develop/typescript),
[pg-boss](https://github.com/timgit/pg-boss).
