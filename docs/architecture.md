# Architecture choices

2026-10-03; M0 and M1 released implementation.

AgentCI is an agent-first CI/CD platform and engineering control plane. Agents
are first-class API consumers and delivery participants; machine-readable intent,
policy, workflow state and evidence support their decisions. Human authorization
remains explicit at consequential boundaries. The target spans specification,
change, evaluation, release and production feedback. M1 semantic PR review is the
first delivered capability, not the complete product. Existing CI and deployment
systems remain execution foundations.

Implemented: TypeScript for CLI/API and shared validation, Node.js 26.10.0 (26.x),
JSON Schema draft-07, Ajv with formats, and YAML parsing. Validators do not coerce,
remove fields, insert defaults, or execute repository code. Strict core objects
catch misspellings; namespaced extensions allow provider capabilities. Independent
project/evidence schema versions start at v1alpha1.

The M0 API remains a development skeleton with health, schema retrieval and
document validation. M1 adds a separate control API: signed GitHub webhooks,
installation/repository allowlisting, durable receipt/outbox and bearer-protected
evidence. PostgreSQL is bound to one organization/repository; shared multi-tenant
hosting is not implemented. The API contract is `specs/api/openapi.json`.

Adopted in M1: Temporal for durable PR-review orchestration.
No deployment or SDK was part of the immutable M0 release. AgentCI needs retries,
cancellation on new PR heads, parallel eval/reviewer steps, external CI completion,
approval waits, and long-running incident/repair flows. Workflows carry immutable
commit/artifact references; activities perform external I/O and must be idempotent
because retries can repeat effects. Only results for the current head SHA may
satisfy its gate. Test workflow versioning and recovery before required checks.

Target architecture: Temporal coordinates; isolated native runners, GitHub Actions
and Tekton execute jobs. In M1, PostgreSQL stores review evidence and GitHub Actions
artifacts retain hosted results. Tekton, general object storage and external OTLP
trace export remain future milestones. Workflow history is
not the evidence API. Keep raw sensitive payloads out of history using references
and controlled artifact storage. Core domain contracts remain free of Temporal
imports. Start with a local development service; Cloud versus production
self-hosting remains open. SaaS, hybrid and self-hosted support remain required.

Alternative: pg-boss provides durable jobs using PostgreSQL and reduces operational
dependencies. It fits a smaller independent-job MVP. AgentCI's full workflow scope
favors Temporal to avoid building multi-step durable coordination ourselves. This
is an architecture assessment, not a performance benchmark.

The M1 release uses PostgreSQL evidence metadata and an SQL initialization
migration, least-privilege GitHub App adapters and advisory Checks, deterministic
structured rules and explicit manifests, and non-root Red Hat UBI 10 minimal with official Node.js 26.10.0 API/worker images pinned by digest, as requested by the user. Review
activities fetch exact Git objects through the official Octokit SDK without
executing PR code. Public GHCR images and the repository-only App are verified.
Trusted GitHub-hosted review uploads evidence before publishing Checks and
reconciles open PRs without requiring the laptop. See `docs/m1-setup.md` for local configuration,
verification and current limits. OPA and object storage are not implemented.

Sources: [Temporal workflows](https://docs.temporal.io/workflows),
[Temporal TypeScript SDK](https://docs.temporal.io/develop/typescript),
[pg-boss](https://github.com/timgit/pg-boss).

## Red Hat technology preference

The owner requested Red Hat technologies as the default where suitable on
2026-10-04. UBI remains the service-image base. Podman is the selected preferred
OCI execution engine. The M2 runner now defaults to Podman through an operator-owned
engine setting; native local rootless execution and SIGKILL recovery have passed.
Hosted CI and the deployed evaluator remain explicit Docker compatibility cohorts
until Podman service/deployment and hosted acceptance passes.
Docker is an explicit interoperability fallback, not proof of Podman support.
Buildah/Skopeo are preferred image tooling where the integration and current stable
versions fit; Tekton/OpenShift retain their planned M7 integration. This preference
does not replace Temporal, protocol libraries or other appropriate components with
an unsuitable alternative, and does not advance uncompleted milestones.
