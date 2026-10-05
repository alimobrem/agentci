# AgentCI implementation status

Source of truth: `specs/requirements.yaml`. Regenerate this view with `npm run status`.

Statuses: `not-started`, `in-progress`, `implemented`, `tested`, `deferred`.

The inventory conservatively includes every numbered section and every prose/list statement outside fenced examples.
Direct source excerpts receive trace IDs; those IDs do not make explanatory or recommended prose normative.
Such inventory entries remain draft until refined. Explicit completed-milestone build/exit requirements carry tested evidence; unfinished product-wide requirements remain open.
A section remains not-started until its entire scope is satisfied; M0 schemas do not complete future product behavior.

Milestone assignments outside the build-plan list are planning estimates, not amendments to the specification.

| ID | Source section / line | Requirement or source statement | Milestone | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| SECTION-1 | 1 / 12 | 1. Executive Summary | M1 | not-started |  |
| SPEC-1-001 | 1 / 14 | AgentCI is a model-agnostic engineering control plane for software developed by humans and coding agents, and for software that itself contains autonomous or semi-autonomous agents. | M1 | not-started |  |
| SPEC-1-002 | 1 / 16 | AgentCI extends existing software delivery rather than replacing it. Git remains the system of record for intended change. Pull requests remain the principal review and approval mechanism. Existing CI engines remain execution engines. Existing deployment and GitOps systems remain deployment engines. OpenTelemetry remains the telemetry foundation. Model Context Protocol (MCP) is a preferred tool boundary. Existing observability platforms remain valid destinations for logs, metrics, and traces. | M1 | not-started |  |
| SPEC-1-003 | 1 / 18 | AgentCI adds six core capabilities: | M1 | not-started |  |
| SPEC-1-004 | 1 / 20 | 1. **Semantic Change Intelligence** - explains changes in terms of intent, requirements, behavior, capabilities, permissions, tools, models, policies, and risk rather than only line diffs. | M1 | not-started |  |
| SPEC-1-005 | 1 / 21 | 2. **Behavioral Eval Orchestration** - selects and runs deterministic tests, agent evaluations, adversarial scenarios, model matrices, and regression suites based on what changed. | M1 | not-started |  |
| SPEC-1-006 | 1 / 22 | 3. **Evidence Graph** - creates a queryable lineage graph connecting requirement -> code -> test/eval -> trace -> PR -> build -> release -> deployment -> production outcome -> incident -> repair. | M1 | not-started |  |
| SPEC-1-007 | 1 / 23 | 4. **Production Correlation** - correlates agent actions with application and infrastructure outcomes to identify likely behavior failures and regressions. | M1 | not-started |  |
| SPEC-1-008 | 1 / 24 | 5. **Regression Learning Loop** - converts reproducible production failures into permanent executable regression cases. | M1 | not-started |  |
| SPEC-1-009 | 1 / 25 | 6. **Risk and Autonomy Control** - independently controls what the system may detect, diagnose, fix, submit, merge, deploy, and remediate automatically. | M1 | not-started |  |
| SPEC-1-010 | 1 / 27 | The first commercial/product wedge is **AI PR Review / Semantic PR Review**. The deeper platform expands from PR evidence into release evidence, runtime evidence, incident learning, and controlled self-repair. | M1 | not-started |  |
| SPEC-1-011 | 1 / 29 | The system must work with OpenAI, Anthropic, xAI, Google, open-weight/local models, and future providers through adapters. It must support GitHub first, then GitLab and others. It must support generic CI runners, with first-class Tekton/OpenShift Pipelines integration. It must support Kubernetes/OpenShift deeply without requiring Kubernetes for the standalone product. | M1 | not-started |  |
| SECTION-2 | 2 / 33 | 2. Product Principles | M1 | not-started |  |
| SECTION-2.1 | 2.1 / 35 | 2.1 Preserve the existing software delivery system | M1 | not-started |  |
| SPEC-2.1-001 | 2.1 / 37 | AgentCI MUST NOT require replacing: | M1 | not-started |  |
| SPEC-2.1-002 | 2.1 / 39 | - Git | M1 | not-started |  |
| SPEC-2.1-003 | 2.1 / 40 | - GitHub/GitLab | M1 | not-started |  |
| SPEC-2.1-004 | 2.1 / 41 | - protected branches and CODEOWNERS | M1 | not-started |  |
| SPEC-2.1-005 | 2.1 / 42 | - existing unit/integration/security tests | M1 | not-started |  |
| SPEC-2.1-006 | 2.1 / 43 | - GitHub Actions, Tekton, Jenkins, GitLab CI, or other CI runners | M1 | not-started |  |
| SPEC-2.1-007 | 2.1 / 44 | - OCI registries | M1 | not-started |  |
| SPEC-2.1-008 | 2.1 / 45 | - SBOM/provenance/signing systems | M1 | not-started |  |
| SPEC-2.1-009 | 2.1 / 46 | - Kubernetes/OpenShift | M1 | not-started |  |
| SPEC-2.1-010 | 2.1 / 47 | - Argo CD / OpenShift GitOps | M1 | not-started |  |
| SPEC-2.1-011 | 2.1 / 48 | - Argo Rollouts or existing progressive delivery systems | M1 | not-started |  |
| SPEC-2.1-012 | 2.1 / 49 | - Prometheus, Grafana, Tempo, Jaeger, Datadog, Splunk, Sentry, or similar observability systems | M1 | not-started |  |
| SPEC-2.1-013 | 2.1 / 51 | AgentCI SHOULD integrate with these systems and add behavioral evidence and controls. | M1 | not-started |  |
| SECTION-2.2 | 2.2 / 53 | 2.2 Specs and evals are executable contracts | M1 | not-started |  |
| SPEC-2.2-001 | 2.2 / 55 | A specification is not documentation only. Requirements MUST be identifiable and traceable to validation evidence. | M1 | not-started |  |
| SECTION-2.3 | 2.3 / 57 | 2.3 Models produce hypotheses; evidence determines confidence | M1 | not-started |  |
| SPEC-2.3-001 | 2.3 / 59 | An LLM review finding MUST NOT automatically become a blocking truth merely because one or more models asserted it. High-impact findings SHOULD be validated by one or more of: | M1 | not-started |  |
| SPEC-2.3-002 | 2.3 / 61 | - deterministic static analysis | M1 | not-started |  |
| SPEC-2.3-003 | 2.3 / 62 | - failing deterministic test | M1 | not-started |  |
| SPEC-2.3-004 | 2.3 / 63 | - failing behavioral eval | M1 | not-started |  |
| SPEC-2.3-005 | 2.3 / 64 | - replay reproduction | M1 | not-started |  |
| SPEC-2.3-006 | 2.3 / 65 | - policy violation | M1 | not-started |  |
| SPEC-2.3-007 | 2.3 / 66 | - independently observed production outcome | M1 | not-started |  |
| SPEC-2.3-008 | 2.3 / 67 | - explicit human confirmation | M1 | not-started |  |
| SECTION-2.4 | 2.4 / 69 | 2.4 Auto-fix is not auto-merge | M1 | not-started |  |
| SPEC-2.4-001 | 2.4 / 71 | The permissions to detect, diagnose, generate a fix, create a branch, open a PR, merge, deploy, and perform production remediation MUST be separately configurable. | M1 | not-started |  |
| SECTION-2.5 | 2.5 / 73 | 2.5 Provider neutrality | M1 | not-started |  |
| SPEC-2.5-001 | 2.5 / 75 | No core domain entity may require a provider-specific model abstraction. Provider capabilities MAY be exposed through extensions. | M1 | not-started |  |
| SECTION-2.6 | 2.6 / 77 | 2.6 Open telemetry and open interfaces first | M1 | not-started |  |
| SPEC-2.6-001 | 2.6 / 79 | Use open standards where practical: | M1 | not-started |  |
| SPEC-2.6-002 | 2.6 / 81 | - Git for source/version lineage | M1 | not-started |  |
| SPEC-2.6-003 | 2.6 / 82 | - OpenTelemetry / OTLP for telemetry | M1 | not-started |  |
| SPEC-2.6-004 | 2.6 / 83 | - MCP for tool discovery and invocation mediation where applicable | M1 | not-started |  |
| SPEC-2.6-005 | 2.6 / 84 | - OCI for artifact identity | M1 | not-started |  |
| SPEC-2.6-006 | 2.6 / 85 | - Sigstore/in-toto/SLSA-compatible mechanisms for signing/provenance where applicable | M1 | not-started |  |
| SPEC-2.6-007 | 2.6 / 86 | - JSON Schema for configuration and event schemas | M1 | not-started |  |
| SECTION-2.7 | 2.7 / 88 | 2.7 Privacy by default | M1 | not-started |  |
| SPEC-2.7-001 | 2.7 / 90 | Raw prompts, model outputs, tool arguments, tool outputs, retrieved documents, source code, and production traces MAY contain sensitive data. Content capture MUST be opt-in or explicitly policy-controlled. Metadata-only operation MUST be supported. | M1 | not-started |  |
| SECTION-3 | 3 / 94 | 3. Scope | M1 | not-started |  |
| SECTION-3.1 | 3.1 / 96 | 3.1 In scope | M1 | not-started |  |
| SPEC-3.1-001 | 3.1 / 98 | AgentCI will support: | M1 | not-started |  |
| SPEC-3.1-002 | 3.1 / 100 | - Git-native project definition | M1 | not-started |  |
| SPEC-3.1-003 | 3.1 / 101 | - spec parsing and requirement IDs | M1 | not-started |  |
| SPEC-3.1-004 | 3.1 / 102 | - semantic PR diffing | M1 | not-started |  |
| SPEC-3.1-005 | 3.1 / 103 | - capability and permission change detection | M1 | not-started |  |
| SPEC-3.1-006 | 3.1 / 104 | - tool schema change detection | M1 | not-started |  |
| SPEC-3.1-007 | 3.1 / 105 | - model/prompt/policy/configuration change detection | M1 | not-started |  |
| SPEC-3.1-008 | 3.1 / 106 | - risk classification and review policy | M1 | not-started |  |
| SPEC-3.1-009 | 3.1 / 107 | - behavioral eval execution and aggregation | M1 | not-started |  |
| SPEC-3.1-010 | 3.1 / 108 | - multi-model review orchestration | M1 | not-started |  |
| SPEC-3.1-011 | 3.1 / 109 | - model matrix comparison | M1 | not-started |  |
| SPEC-3.1-012 | 3.1 / 110 | - normalized tracing for agent/model/tool/policy events | M1 | not-started |  |
| SPEC-3.1-013 | 3.1 / 111 | - GitHub Checks/PR annotations | M1 | not-started |  |
| SPEC-3.1-014 | 3.1 / 112 | - evidence graph storage and APIs | M1 | not-started |  |
| SPEC-3.1-015 | 3.1 / 113 | - immutable release evidence manifests | M1 | not-started |  |
| SPEC-3.1-016 | 3.1 / 114 | - CI adapters, including Tekton | M1 | not-started |  |
| SPEC-3.1-017 | 3.1 / 115 | - OpenShift-native distribution | M1 | not-started |  |
| SPEC-3.1-018 | 3.1 / 116 | - production telemetry ingestion | M1 | not-started |  |
| SPEC-3.1-019 | 3.1 / 117 | - incident candidate creation | M1 | not-started |  |
| SPEC-3.1-020 | 3.1 / 118 | - replay and reproduction orchestration | M1 | not-started |  |
| SPEC-3.1-021 | 3.1 / 119 | - production incident -> regression conversion | M1 | not-started |  |
| SPEC-3.1-022 | 3.1 / 120 | - controlled repair workflow and PR generation | M1 | not-started |  |
| SPEC-3.1-023 | 3.1 / 121 | - canary/promotion evidence integration | M1 | not-started |  |
| SPEC-3.1-024 | 3.1 / 122 | - self-dogfooding from early development onward | M1 | not-started |  |
| SECTION-3.2 | 3.2 / 124 | 3.2 Explicitly out of scope for initial versions | M1 | not-started |  |
| SPEC-3.2-001 | 3.2 / 126 | AgentCI will not initially attempt to build: | M1 | not-started |  |
| SPEC-3.2-002 | 3.2 / 128 | - a general source-control platform | M1 | not-started |  |
| SPEC-3.2-003 | 3.2 / 129 | - a general CI runner | M1 | not-started |  |
| SPEC-3.2-004 | 3.2 / 130 | - a new agent framework | M1 | not-started |  |
| SPEC-3.2-005 | 3.2 / 131 | - a new coding agent | M1 | not-started |  |
| SPEC-3.2-006 | 3.2 / 132 | - a new observability database | M1 | not-started |  |
| SPEC-3.2-007 | 3.2 / 133 | - a new distributed tracing protocol | M1 | not-started |  |
| SPEC-3.2-008 | 3.2 / 134 | - a general policy language replacing OPA/Kyverno/etc. | M1 | not-started |  |
| SPEC-3.2-009 | 3.2 / 135 | - a general secrets manager | M1 | not-started |  |
| SPEC-3.2-010 | 3.2 / 136 | - a container registry | M1 | not-started |  |
| SPEC-3.2-011 | 3.2 / 137 | - a universal application deployment engine | M1 | not-started |  |
| SPEC-3.2-012 | 3.2 / 138 | - a universal benchmark ranking models for all workloads | M1 | not-started |  |
| SPEC-3.2-013 | 3.2 / 139 | - an opaque autonomous system that merges/deploys production changes without policy boundaries | M1 | not-started |  |
| SECTION-4 | 4 / 143 | 4. Personas | M1 | not-started |  |
| SECTION-4.1 | 4.1 / 145 | 4.1 Application developer | M1 | not-started |  |
| SPEC-4.1-001 | 4.1 / 147 | Needs to understand what an AI-generated PR actually changes and whether it is safe to merge. | M1 | not-started |  |
| SECTION-4.2 | 4.2 / 149 | 4.2 Reviewer / senior engineer | M1 | not-started |  |
| SPEC-4.2-001 | 4.2 / 151 | Needs compressed, evidence-backed review information rather than reading thousands of generated lines. | M1 | not-started |  |
| SECTION-4.3 | 4.3 / 153 | 4.3 Platform engineer | M1 | not-started |  |
| SPEC-4.3-001 | 4.3 / 155 | Needs reusable CI, policy, model, tracing, and deployment primitives across many repositories. | M1 | not-started |  |
| SECTION-4.4 | 4.4 / 157 | 4.4 SRE | M1 | not-started |  |
| SPEC-4.4-001 | 4.4 / 159 | Needs correlation between agent actions, deployments, incidents, regressions, and remediations. | M1 | not-started |  |
| SECTION-4.5 | 4.5 / 161 | 4.5 AppSec / security reviewer | M1 | not-started |  |
| SPEC-4.5-001 | 4.5 / 163 | Needs visibility into new permissions, tools, external effects, data access, model/provider changes, and policy bypass risk. | M1 | not-started |  |
| SECTION-4.6 | 4.6 / 165 | 4.6 Engineering leader | M1 | not-started |  |
| SPEC-4.6-001 | 4.6 / 167 | Needs metrics showing review quality, regression risk, delivery speed, model effectiveness, cost, and production impact. | M1 | not-started |  |
| SECTION-4.7 | 4.7 / 169 | 4.7 Regulated-enterprise operator | M1 | not-started |  |
| SPEC-4.7-001 | 4.7 / 171 | Needs self-hosted/hybrid deployment, data controls, auditability, identity, and signed evidence. | M1 | not-started |  |
| SECTION-5 | 5 / 175 | 5. Primary User Journeys | M1 | not-started |  |
| SECTION-5.1 | 5.1 / 177 | 5.1 PR review journey | M1 | not-started |  |
| SPEC-5.1-001 | 5.1 / 179 | 1. Developer or coding agent opens a PR. | M1 | not-started |  |
| SPEC-5.1-002 | 5.1 / 180 | 2. AgentCI receives repository event. | M1 | not-started |  |
| SPEC-5.1-003 | 5.1 / 181 | 3. AgentCI loads project configuration and base/head commits. | M1 | not-started |  |
| SPEC-5.1-004 | 5.1 / 182 | 4. Change Intelligence Engine computes: | M1 | not-started |  |
| SPEC-5.1-005 | 5.1 / 183 | - ordinary code diff metadata | M1 | not-started |  |
| SPEC-5.1-006 | 5.1 / 184 | - spec diff | M1 | not-started |  |
| SPEC-5.1-007 | 5.1 / 185 | - requirement diff | M1 | not-started |  |
| SPEC-5.1-008 | 5.1 / 186 | - capability diff | M1 | not-started |  |
| SPEC-5.1-009 | 5.1 / 187 | - permission diff | M1 | not-started |  |
| SPEC-5.1-010 | 5.1 / 188 | - tool diff | M1 | not-started |  |
| SPEC-5.1-011 | 5.1 / 189 | - model/provider diff | M1 | not-started |  |
| SPEC-5.1-012 | 5.1 / 190 | - prompt/instruction diff | M1 | not-started |  |
| SPEC-5.1-013 | 5.1 / 191 | - policy diff | M1 | not-started |  |
| SPEC-5.1-014 | 5.1 / 192 | - dependency/supply-chain diff | M1 | not-started |  |
| SPEC-5.1-015 | 5.1 / 193 | 5. Risk Engine classifies each change. | M1 | not-started |  |
| SPEC-5.1-016 | 5.1 / 194 | 6. Eval Orchestrator selects the minimum required verification plan. | M1 | not-started |  |
| SPEC-5.1-017 | 5.1 / 195 | 7. Existing deterministic CI runs or is consumed as external evidence. | M1 | not-started |  |
| SPEC-5.1-018 | 5.1 / 196 | 8. Agent behavioral evals run. | M1 | not-started |  |
| SPEC-5.1-019 | 5.1 / 197 | 9. Independent model reviewers analyze designated dimensions. | M1 | not-started |  |
| SPEC-5.1-020 | 5.1 / 198 | 10. Findings are deduplicated and, where possible, reproduced. | M1 | not-started |  |
| SPEC-5.1-021 | 5.1 / 199 | 11. Evidence Graph links all artifacts. | M1 | not-started |  |
| SPEC-5.1-022 | 5.1 / 200 | 12. GitHub Check summarizes findings and annotations. | M1 | not-started |  |
| SPEC-5.1-023 | 5.1 / 201 | 13. Required policy determines whether the check is success, failure, neutral, or action required. | M1 | not-started |  |
| SPEC-5.1-024 | 5.1 / 202 | 14. Human reviewers make merge decision unless policy explicitly permits automated merge. | M1 | not-started |  |
| SECTION-5.2 | 5.2 / 204 | 5.2 Model change journey | M1 | not-started |  |
| SPEC-5.2-001 | 5.2 / 206 | 1. PR changes `provider/model` or model policy. | M1 | not-started |  |
| SPEC-5.2-002 | 5.2 / 207 | 2. System detects a model change. | M1 | not-started |  |
| SPEC-5.2-003 | 5.2 / 208 | 3. Eval Orchestrator runs the same workload against base and candidate model(s). | M1 | not-started |  |
| SPEC-5.2-004 | 5.2 / 209 | 4. Compare: | M1 | not-started |  |
| SPEC-5.2-005 | 5.2 / 210 | - success rate | M1 | not-started |  |
| SPEC-5.2-006 | 5.2 / 211 | - tool-selection correctness | M1 | not-started |  |
| SPEC-5.2-007 | 5.2 / 212 | - policy compliance | M1 | not-started |  |
| SPEC-5.2-008 | 5.2 / 213 | - latency | M1 | not-started |  |
| SPEC-5.2-009 | 5.2 / 214 | - token usage | M1 | not-started |  |
| SPEC-5.2-010 | 5.2 / 215 | - cost estimate | M1 | not-started |  |
| SPEC-5.2-011 | 5.2 / 216 | - variance | M1 | not-started |  |
| SPEC-5.2-012 | 5.2 / 217 | - scenario regressions | M1 | not-started |  |
| SPEC-5.2-013 | 5.2 / 218 | 5. PR displays behavioral delta rather than only configuration delta. | M1 | not-started |  |
| SECTION-5.3 | 5.3 / 220 | 5.3 Production failure journey | M1 | not-started |  |
| SPEC-5.3-001 | 5.3 / 222 | 1. Existing monitoring, invariant checks, user feedback, or agent telemetry identifies abnormal behavior. | M1 | not-started |  |
| SPEC-5.3-002 | 5.3 / 223 | 2. AgentCI creates an `IncidentCandidate` with release and trace lineage. | M1 | not-started |  |
| SPEC-5.3-003 | 5.3 / 224 | 3. Correlator finds relevant agent/model/tool/deployment traces. | M1 | not-started |  |
| SPEC-5.3-004 | 5.3 / 225 | 4. Replay service attempts deterministic/simulated/ephemeral reproduction. | M1 | not-started |  |
| SPEC-5.3-005 | 5.3 / 226 | 5. If reproducible, Regression Generator creates a regression fixture/eval. | M1 | not-started |  |
| SPEC-5.3-006 | 5.3 / 227 | 6. Root Cause workflow generates hypotheses and validates them. | M1 | not-started |  |
| SPEC-5.3-007 | 5.3 / 228 | 7. Repair Orchestrator creates candidate fixes. | M1 | not-started |  |
| SPEC-5.3-008 | 5.3 / 229 | 8. Candidate fixes are evaluated against: | M1 | not-started |  |
| SPEC-5.3-009 | 5.3 / 230 | - new regression | M1 | not-started |  |
| SPEC-5.3-010 | 5.3 / 231 | - full existing eval suite | M1 | not-started |  |
| SPEC-5.3-011 | 5.3 / 232 | - deterministic tests | M1 | not-started |  |
| SPEC-5.3-012 | 5.3 / 233 | - security/policy gates | M1 | not-started |  |
| SPEC-5.3-013 | 5.3 / 234 | 9. Best proven candidate may be submitted as PR according to policy. | M1 | not-started |  |
| SPEC-5.3-014 | 5.3 / 235 | 10. Merge/deploy remains governed separately. | M1 | not-started |  |
| SPEC-5.3-015 | 5.3 / 236 | 11. Canary/progressive delivery validates the outcome. | M1 | not-started |  |
| SPEC-5.3-016 | 5.3 / 237 | 12. Incident is closed only after defined production verification. | M1 | not-started |  |
| SPEC-5.3-017 | 5.3 / 238 | 13. Regression remains in the permanent suite. | M1 | not-started |  |
| SECTION-6 | 6 / 242 | 6. System Architecture | M1 | not-started |  |
| SECTION-6.1 | 6.1 / 244 | 6.1 Logical architecture | M1 | not-started |  |
| SECTION-6.2 | 6.2 / 313 | 6.2 Control plane vs data plane | M1 | not-started |  |
| SPEC-6.2-001 | 6.2 / 317 | Responsible for: | M1 | not-started |  |
| SPEC-6.2-002 | 6.2 / 319 | - API and UI | M1 | not-started |  |
| SPEC-6.2-003 | 6.2 / 320 | - project configuration | M1 | not-started |  |
| SPEC-6.2-004 | 6.2 / 321 | - semantic diffing | M1 | not-started |  |
| SPEC-6.2-005 | 6.2 / 322 | - orchestration | M1 | not-started |  |
| SPEC-6.2-006 | 6.2 / 323 | - policies and autonomy decisions | M1 | not-started |  |
| SPEC-6.2-007 | 6.2 / 324 | - evidence graph | M1 | not-started |  |
| SPEC-6.2-008 | 6.2 / 325 | - incident lifecycle | M1 | not-started |  |
| SPEC-6.2-009 | 6.2 / 326 | - model performance history | M1 | not-started |  |
| SPEC-6.2-010 | 6.2 / 327 | - repair workflow coordination | M1 | not-started |  |
| SPEC-6.2-011 | 6.2 / 331 | Runs close to customer workloads and code when configured: | M1 | not-started |  |
| SPEC-6.2-012 | 6.2 / 333 | - eval runners | M1 | not-started |  |
| SPEC-6.2-013 | 6.2 / 334 | - model SDK instrumentation | M1 | not-started |  |
| SPEC-6.2-014 | 6.2 / 335 | - MCP gateway/proxy | M1 | not-started |  |
| SPEC-6.2-015 | 6.2 / 336 | - OpenTelemetry collectors | M1 | not-started |  |
| SPEC-6.2-016 | 6.2 / 337 | - optional Kubernetes/OpenShift operator | M1 | not-started |  |
| SPEC-6.2-017 | 6.2 / 338 | - ephemeral replay environments | M1 | not-started |  |
| SPEC-6.2-018 | 6.2 / 340 | The product MUST support SaaS, hybrid, and fully self-hosted deployment. | M1 | not-started |  |
| SECTION-7 | 7 / 344 | 7. Repository Contract | M0 | not-started |  |
| SECTION-7.1 | 7.1 / 346 | 7.1 Canonical repository layout | M0 | not-started |  |
| SPEC-7.1-001 | 7.1 / 348 | Recommended but configurable: | M0 | not-started |  |
| SECTION-7.2 | 7.2 / 368 | 7.2 `agentci.yaml` | M0 | not-started |  |
| SPEC-7.2-001 | 7.2 / 370 | Minimum example: | M0 | not-started |  |
| SECTION-7.3 | 7.3 / 413 | 7.3 Configuration merge order | M0 | not-started |  |
| SPEC-7.3-001 | 7.3 / 415 | Highest precedence last: | M0 | not-started |  |
| SPEC-7.3-002 | 7.3 / 417 | 1. product defaults | M0 | not-started |  |
| SPEC-7.3-003 | 7.3 / 418 | 2. organization policy | M0 | not-started |  |
| SPEC-7.3-004 | 7.3 / 419 | 3. repository `agentci.yaml` | M0 | not-started |  |
| SPEC-7.3-005 | 7.3 / 420 | 4. branch/PR policy overlay if allowed | M0 | not-started |  |
| SPEC-7.3-006 | 7.3 / 421 | 5. explicit workflow invocation parameters | M0 | not-started |  |
| SPEC-7.3-007 | 7.3 / 423 | Organization administrators MUST be able to mark policy fields as non-overridable by repositories. | M0 | not-started |  |
| SECTION-8 | 8 / 427 | 8. Specification and Requirement Model | M0 | not-started |  |
| SECTION-8.1 | 8.1 / 429 | 8.1 Requirement entity | M0 | not-started |  |
| SECTION-8.2 | 8.2 / 449 | 8.2 Requirement types | M0 | not-started |  |
| SPEC-8.2-001 | 8.2 / 451 | - functional | M0 | not-started |  |
| SPEC-8.2-002 | 8.2 / 452 | - nonfunctional | M0 | not-started |  |
| SPEC-8.2-003 | 8.2 / 453 | - safety | M0 | not-started |  |
| SPEC-8.2-004 | 8.2 / 454 | - security | M0 | not-started |  |
| SPEC-8.2-005 | 8.2 / 455 | - privacy | M0 | not-started |  |
| SPEC-8.2-006 | 8.2 / 456 | - performance | M0 | not-started |  |
| SPEC-8.2-007 | 8.2 / 457 | - cost | M0 | not-started |  |
| SPEC-8.2-008 | 8.2 / 458 | - availability | M0 | not-started |  |
| SPEC-8.2-009 | 8.2 / 459 | - compliance | M0 | not-started |  |
| SPEC-8.2-010 | 8.2 / 460 | - human-approval | M0 | not-started |  |
| SPEC-8.2-011 | 8.2 / 461 | - business-invariant | M0 | not-started |  |
| SECTION-8.3 | 8.3 / 463 | 8.3 Requirement lifecycle | M0 | not-started |  |
| SPEC-8.3-001 | 8.3 / 465 | `draft -> active -> deprecated -> retired` | M0 | not-started |  |
| SPEC-8.3-002 | 8.3 / 467 | A PR that removes or weakens an active safety/security requirement MUST be classified at least `high` risk by default. | M0 | not-started |  |
| SECTION-8.4 | 8.4 / 469 | 8.4 Requirement extraction | M0 | not-started |  |
| SPEC-8.4-001 | 8.4 / 471 | V1 MUST support explicitly identified requirements in YAML or markdown front matter. | M0 | not-started |  |
| SPEC-8.4-002 | 8.4 / 473 | V1 MAY propose IDs for unstructured markdown using an LLM, but MUST present inferred requirements as `proposed` until accepted or explicitly enabled by policy. | M0 | not-started |  |
| SPEC-8.4-003 | 8.4 / 475 | Do not make build success dependent on perfect natural-language compilation. | M0 | not-started |  |
| SECTION-9 | 9 / 479 | 9. Semantic Change Intelligence | M1 | not-started |  |
| SECTION-9.1 | 9.1 / 481 | 9.1 Output categories | M1 | not-started |  |
| SPEC-9.1-001 | 9.1 / 483 | For every PR, compute: | M1 | not-started |  |
| SPEC-9.1-002 | 9.1 / 485 | - source/code changes | M1 | not-started |  |
| SPEC-9.1-003 | 9.1 / 486 | - requirement changes | M1 | not-started |  |
| SPEC-9.1-004 | 9.1 / 487 | - capability changes | M1 | not-started |  |
| SPEC-9.1-005 | 9.1 / 488 | - permission changes | M1 | not-started |  |
| SPEC-9.1-006 | 9.1 / 489 | - external side-effect changes | M1 | not-started |  |
| SPEC-9.1-007 | 9.1 / 490 | - tool/schema changes | M1 | not-started |  |
| SPEC-9.1-008 | 9.1 / 491 | - model/provider changes | M1 | not-started |  |
| SPEC-9.1-009 | 9.1 / 492 | - prompt/instruction changes | M1 | not-started |  |
| SPEC-9.1-010 | 9.1 / 493 | - memory/RAG changes | M1 | not-started |  |
| SPEC-9.1-011 | 9.1 / 494 | - policy changes | M1 | not-started |  |
| SPEC-9.1-012 | 9.1 / 495 | - dependency changes | M1 | not-started |  |
| SPEC-9.1-013 | 9.1 / 496 | - API changes | M1 | not-started |  |
| SPEC-9.1-014 | 9.1 / 497 | - data-schema changes | M1 | not-started |  |
| SPEC-9.1-015 | 9.1 / 498 | - deployment changes | M1 | not-started |  |
| SPEC-9.1-016 | 9.1 / 499 | - test/eval changes | M1 | not-started |  |
| SECTION-9.2 | 9.2 / 501 | 9.2 Capability model | M1 | not-started |  |
| SPEC-9.2-001 | 9.2 / 503 | A capability is a normalized action the application/agent may perform. | M1 | not-started |  |
| SPEC-9.2-002 | 9.2 / 505 | Example: | M1 | not-started |  |
| SPEC-9.2-003 | 9.2 / 516 | Capabilities can be derived from: | M1 | not-started |  |
| SPEC-9.2-004 | 9.2 / 518 | - MCP tool definitions | M1 | not-started |  |
| SPEC-9.2-005 | 9.2 / 519 | - function/tool schemas | M1 | not-started |  |
| SPEC-9.2-006 | 9.2 / 520 | - SDK registrations | M1 | not-started |  |
| SPEC-9.2-007 | 9.2 / 521 | - OpenAPI specs | M1 | not-started |  |
| SPEC-9.2-008 | 9.2 / 522 | - RBAC definitions | M1 | not-started |  |
| SPEC-9.2-009 | 9.2 / 523 | - explicit manifest declaration | M1 | not-started |  |
| SPEC-9.2-010 | 9.2 / 524 | - static analysis | M1 | not-started |  |
| SECTION-9.3 | 9.3 / 526 | 9.3 Permission model | M1 | not-started |  |
| SPEC-9.3-001 | 9.3 / 528 | Permission change categories: | M1 | not-started |  |
| SPEC-9.3-002 | 9.3 / 530 | - no change | M1 | not-started |  |
| SPEC-9.3-003 | 9.3 / 531 | - scope narrowed | M1 | not-started |  |
| SPEC-9.3-004 | 9.3 / 532 | - scope broadened | M1 | not-started |  |
| SPEC-9.3-005 | 9.3 / 533 | - new read | M1 | not-started |  |
| SPEC-9.3-006 | 9.3 / 534 | - new write | M1 | not-started |  |
| SPEC-9.3-007 | 9.3 / 535 | - new destructive action | M1 | not-started |  |
| SPEC-9.3-008 | 9.3 / 536 | - new external network access | M1 | not-started |  |
| SPEC-9.3-009 | 9.3 / 537 | - new secret access | M1 | not-started |  |
| SPEC-9.3-010 | 9.3 / 538 | - new production access | M1 | not-started |  |
| SPEC-9.3-011 | 9.3 / 539 | - new data-class access | M1 | not-started |  |
| SECTION-9.4 | 9.4 / 541 | 9.4 Behavioral diff | M1 | not-started |  |
| SPEC-9.4-001 | 9.4 / 543 | Behavioral diff is probabilistic evidence and MUST be labeled accordingly. | M1 | not-started |  |
| SPEC-9.4-002 | 9.4 / 545 | Inputs MAY include: | M1 | not-started |  |
| SPEC-9.4-003 | 9.4 / 547 | - base vs head eval outcomes | M1 | not-started |  |
| SPEC-9.4-004 | 9.4 / 548 | - base vs head normalized traces | M1 | not-started |  |
| SPEC-9.4-005 | 9.4 / 549 | - tool-call sequence changes | M1 | not-started |  |
| SPEC-9.4-006 | 9.4 / 550 | - decision/result changes | M1 | not-started |  |
| SPEC-9.4-007 | 9.4 / 551 | - static code/spec analysis | M1 | not-started |  |
| SPEC-9.4-008 | 9.4 / 552 | - model reviewer analysis | M1 | not-started |  |
| SPEC-9.4-009 | 9.4 / 554 | Output example: | M1 | not-started |  |
| SECTION-9.5 | 9.5 / 566 | 9.5 Change Intelligence acceptance criteria | M1 | not-started |  |
| SPEC-9.5-001 | 9.5 / 568 | - Deterministic configuration changes MUST be exactly identified. | M1 | not-started |  |
| SPEC-9.5-002 | 9.5 / 569 | - Any added production write/destructive permission MUST trigger a finding even if LLM analysis is unavailable. | M1 | not-started |  |
| SPEC-9.5-003 | 9.5 / 570 | - The system MUST distinguish asserted/inferred findings from verified findings. | M1 | not-started |  |
| SPEC-9.5-004 | 9.5 / 571 | - The PR check MUST provide links to underlying evidence. | M1 | not-started |  |
| SECTION-10 | 10 / 575 | 10. Risk Engine | M1 | not-started |  |
| SECTION-10.1 | 10.1 / 577 | 10.1 Risk levels | M1 | not-started |  |
| SPEC-10.1-001 | 10.1 / 579 | - informational | M1 | not-started |  |
| SPEC-10.1-002 | 10.1 / 580 | - low | M1 | not-started |  |
| SPEC-10.1-003 | 10.1 / 581 | - medium | M1 | not-started |  |
| SPEC-10.1-004 | 10.1 / 582 | - high | M1 | not-started |  |
| SPEC-10.1-005 | 10.1 / 583 | - critical | M1 | not-started |  |
| SECTION-10.2 | 10.2 / 585 | 10.2 Deterministic high-risk examples | M1 | not-started |  |
| SPEC-10.2-001 | 10.2 / 587 | - new production write/delete permission | M1 | not-started |  |
| SPEC-10.2-002 | 10.2 / 588 | - secret-reading capability | M1 | not-started |  |
| SPEC-10.2-003 | 10.2 / 589 | - authn/authz logic modification | M1 | not-started |  |
| SPEC-10.2-004 | 10.2 / 590 | - approval-policy weakening | M1 | not-started |  |
| SPEC-10.2-005 | 10.2 / 591 | - external data export | M1 | not-started |  |
| SPEC-10.2-006 | 10.2 / 592 | - payment/refund capability | M1 | not-started |  |
| SPEC-10.2-007 | 10.2 / 593 | - destructive DB/schema migration | M1 | not-started |  |
| SPEC-10.2-008 | 10.2 / 594 | - disabled safety eval | M1 | not-started |  |
| SPEC-10.2-009 | 10.2 / 595 | - telemetry redaction disabled for sensitive class | M1 | not-started |  |
| SECTION-10.3 | 10.3 / 597 | 10.3 Policy example | M1 | not-started |  |
| SECTION-10.4 | 10.4 / 624 | 10.4 Risk is multi-dimensional | M1 | not-started |  |
| SPEC-10.4-001 | 10.4 / 626 | Store at least: | M1 | not-started |  |
| SPEC-10.4-002 | 10.4 / 628 | - impact severity | M1 | not-started |  |
| SPEC-10.4-003 | 10.4 / 629 | - likelihood estimate | M1 | not-started |  |
| SPEC-10.4-004 | 10.4 / 630 | - reversibility | M1 | not-started |  |
| SPEC-10.4-005 | 10.4 / 631 | - blast radius | M1 | not-started |  |
| SPEC-10.4-006 | 10.4 / 632 | - data sensitivity | M1 | not-started |  |
| SPEC-10.4-007 | 10.4 / 633 | - autonomy level | M1 | not-started |  |
| SPEC-10.4-008 | 10.4 / 634 | - evidence confidence | M1 | not-started |  |
| SPEC-10.4-009 | 10.4 / 636 | Do not collapse all decisions into a single opaque LLM score. | M1 | not-started |  |
| SECTION-11 | 11 / 640 | 11. Eval Orchestration | M2 | tested | releases/m2-final-acceptance-audit.json |
| SECTION-11.1 | 11.1 / 642 | 11.1 Eval classes | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-001 | 11.1 / 644 | - deterministic unit tests | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-002 | 11.1 / 645 | - integration tests | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-003 | 11.1 / 646 | - contract tests | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-004 | 11.1 / 647 | - policy tests | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-005 | 11.1 / 648 | - golden behavior evals | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-006 | 11.1 / 649 | - regression evals | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-007 | 11.1 / 650 | - adversarial evals | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-008 | 11.1 / 651 | - safety evals | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-009 | 11.1 / 652 | - tool-use evals | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-010 | 11.1 / 653 | - trajectory evals | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-011 | 11.1 / 654 | - latency/performance evals | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-012 | 11.1 / 655 | - cost/token evals | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.1-013 | 11.1 / 656 | - model comparison evals | M2 | tested | releases/m2-final-acceptance-audit.json |
| SECTION-11.2 | 11.2 / 658 | 11.2 Eval selection | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.2-001 | 11.2 / 660 | The orchestrator MUST select evals based on change impact. | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.2-002 | 11.2 / 662 | Examples: | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.2-003 | 11.2 / 664 | - prompt wording only -> targeted prompt/eval suite | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.2-004 | 11.2 / 665 | - tool schema change -> all tool-contract and affected behavioral evals | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.2-005 | 11.2 / 666 | - model change -> model matrix over required representative suite | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.2-006 | 11.2 / 667 | - permission expansion -> permission/policy/adversarial suite | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.2-007 | 11.2 / 668 | - spec change -> all mapped requirements plus coverage gap analysis | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.2-008 | 11.2 / 669 | - low-level library refactor -> deterministic tests plus mapped behavior regressions | M2 | tested | releases/m2-final-acceptance-audit.json |
| SECTION-11.3 | 11.3 / 671 | 11.3 Statistical execution | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.3-001 | 11.3 / 673 | Each eval may define trial semantics: | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.3-002 | 11.3 / 683 | Critical safety assertions SHOULD default to zero tolerated violations in the configured sample. | M2 | tested | releases/m2-final-acceptance-audit.json |
| SECTION-11.4 | 11.4 / 685 | 11.4 Pluggable eval engines | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.4-001 | 11.4 / 687 | Adapters SHOULD support: | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.4-002 | 11.4 / 689 | - pytest/custom test commands | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.4-003 | 11.4 / 690 | - DeepEval | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.4-004 | 11.4 / 691 | - Promptfoo | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.4-005 | 11.4 / 692 | - custom HTTP eval providers | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.4-006 | 11.4 / 693 | - native AgentCI structured evals | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-11.4-007 | 11.4 / 695 | AgentCI owns orchestration and evidence normalization, not all evaluation algorithms. | M2 | tested | releases/m2-final-acceptance-audit.json |
| SECTION-11.5 | 11.5 / 697 | 11.5 Eval result schema | M2 | tested | releases/m2-final-acceptance-audit.json |
| SECTION-12 | 12 / 722 | 12. Multi-Model Review | M3 | not-started |  |
| SECTION-12.1 | 12.1 / 724 | 12.1 Reviewer roles | M3 | not-started |  |
| SPEC-12.1-001 | 12.1 / 726 | Configure independent roles such as: | M3 | not-started |  |
| SPEC-12.1-002 | 12.1 / 728 | - specification compliance | M3 | not-started |  |
| SPEC-12.1-003 | 12.1 / 729 | - code correctness | M3 | not-started |  |
| SPEC-12.1-004 | 12.1 / 730 | - architecture | M3 | not-started |  |
| SPEC-12.1-005 | 12.1 / 731 | - security | M3 | not-started |  |
| SPEC-12.1-006 | 12.1 / 732 | - adversarial/breaker | M3 | not-started |  |
| SPEC-12.1-007 | 12.1 / 733 | - test/eval completeness | M3 | not-started |  |
| SPEC-12.1-008 | 12.1 / 734 | - operational reliability | M3 | not-started |  |
| SECTION-12.2 | 12.2 / 736 | 12.2 Independence rule | M3 | not-started |  |
| SPEC-12.2-001 | 12.2 / 738 | The implementation model SHOULD NOT be the sole required reviewer. Policies SHOULD allow `differentProvider: true` for designated reviews. | M3 | not-started |  |
| SECTION-12.3 | 12.3 / 740 | 12.3 Finding lifecycle | M3 | not-started |  |
| SPEC-12.3-001 | 12.3 / 742 | `proposed -> deduplicated -> reproduction-pending -> confirmed \| unconfirmed \| false-positive -> resolved` | M3 | not-started |  |
| SECTION-12.4 | 12.4 / 744 | 12.4 Finding schema | M3 | not-started |  |
| SECTION-12.5 | 12.5 / 764 | 12.5 Majority vote prohibited as sole blocking mechanism | M3 | not-started |  |
| SPEC-12.5-001 | 12.5 / 766 | Consensus MAY increase priority, but three models making the same unsupported claim MUST NOT automatically block a PR unless configured by the customer. | M3 | not-started |  |
| SECTION-13 | 13 / 770 | 13. Model Provider and Routing Layer | M3 | not-started |  |
| SECTION-13.1 | 13.1 / 772 | 13.1 Normalized provider interface | M3 | not-started |  |
| SECTION-13.2 | 13.2 / 783 | 13.2 Normalized model request | M3 | not-started |  |
| SPEC-13.2-001 | 13.2 / 785 | Must represent: | M3 | not-started |  |
| SPEC-13.2-002 | 13.2 / 787 | - messages/input | M3 | not-started |  |
| SPEC-13.2-003 | 13.2 / 788 | - system/developer instructions | M3 | not-started |  |
| SPEC-13.2-004 | 13.2 / 789 | - tool definitions | M3 | not-started |  |
| SPEC-13.2-005 | 13.2 / 790 | - response schema | M3 | not-started |  |
| SPEC-13.2-006 | 13.2 / 791 | - model parameters | M3 | not-started |  |
| SPEC-13.2-007 | 13.2 / 792 | - metadata | M3 | not-started |  |
| SPEC-13.2-008 | 13.2 / 793 | - timeout/retry policy | M3 | not-started |  |
| SECTION-13.3 | 13.3 / 795 | 13.3 Provider adapters | M3 | not-started |  |
| SPEC-13.3-001 | 13.3 / 797 | Initial adapters: | M3 | not-started |  |
| SPEC-13.3-002 | 13.3 / 799 | - OpenAI | M3 | not-started |  |
| SPEC-13.3-003 | 13.3 / 800 | - Anthropic | M3 | not-started |  |
| SPEC-13.3-004 | 13.3 / 801 | - xAI | M3 | not-started |  |
| SPEC-13.3-005 | 13.3 / 803 | Next: | M3 | not-started |  |
| SPEC-13.3-006 | 13.3 / 805 | - Google | M3 | not-started |  |
| SPEC-13.3-007 | 13.3 / 806 | - OpenAI-compatible endpoints | M3 | not-started |  |
| SPEC-13.3-008 | 13.3 / 807 | - Ollama | M3 | not-started |  |
| SPEC-13.3-009 | 13.3 / 808 | - vLLM | M3 | not-started |  |
| SECTION-13.4 | 13.4 / 810 | 13.4 Provider extensions | M3 | not-started |  |
| SPEC-13.4-001 | 13.4 / 812 | Portable core MUST coexist with namespaced extensions: | M3 | not-started |  |
| SECTION-13.5 | 13.5 / 821 | 13.5 Model router | M3 | not-started |  |
| SPEC-13.5-001 | 13.5 / 823 | Not required for earliest MVP. | M3 | not-started |  |
| SPEC-13.5-002 | 13.5 / 825 | When enabled, router inputs include: | M3 | not-started |  |
| SPEC-13.5-003 | 13.5 / 827 | - task category | M3 | not-started |  |
| SPEC-13.5-004 | 13.5 / 828 | - repository | M3 | not-started |  |
| SPEC-13.5-005 | 13.5 / 829 | - language/framework | M3 | not-started |  |
| SPEC-13.5-006 | 13.5 / 830 | - historical eval performance | M3 | not-started |  |
| SPEC-13.5-007 | 13.5 / 831 | - production regression rate | M3 | not-started |  |
| SPEC-13.5-008 | 13.5 / 832 | - context size | M3 | not-started |  |
| SPEC-13.5-009 | 13.5 / 833 | - latency requirements | M3 | not-started |  |
| SPEC-13.5-010 | 13.5 / 834 | - cost budget | M3 | not-started |  |
| SPEC-13.5-011 | 13.5 / 835 | - model availability | M3 | not-started |  |
| SPEC-13.5-012 | 13.5 / 836 | - risk level | M3 | not-started |  |
| SPEC-13.5-013 | 13.5 / 838 | Routing decisions MUST be recorded as evidence. | M3 | not-started |  |
| SECTION-14 | 14 / 842 | 14. Runtime Instrumentation and Tracing | M4 | not-started |  |
| SECTION-14.1 | 14.1 / 844 | 14.1 Principle | M4 | not-started |  |
| SPEC-14.1-001 | 14.1 / 846 | Capture externally observable execution, not hidden chain-of-thought. | M4 | not-started |  |
| SPEC-14.1-002 | 14.1 / 848 | Record: | M4 | not-started |  |
| SPEC-14.1-003 | 14.1 / 850 | - agent invocation | M4 | not-started |  |
| SPEC-14.1-004 | 14.1 / 851 | - model invocation | M4 | not-started |  |
| SPEC-14.1-005 | 14.1 / 852 | - planning phase when explicitly exposed | M4 | not-started |  |
| SPEC-14.1-006 | 14.1 / 853 | - tool invocation | M4 | not-started |  |
| SPEC-14.1-007 | 14.1 / 854 | - tool result metadata | M4 | not-started |  |
| SPEC-14.1-008 | 14.1 / 855 | - handoff | M4 | not-started |  |
| SPEC-14.1-009 | 14.1 / 856 | - policy decision | M4 | not-started |  |
| SPEC-14.1-010 | 14.1 / 857 | - human approval | M4 | not-started |  |
| SPEC-14.1-011 | 14.1 / 858 | - external side effect | M4 | not-started |  |
| SPEC-14.1-012 | 14.1 / 859 | - eval annotation | M4 | not-started |  |
| SPEC-14.1-013 | 14.1 / 860 | - errors | M4 | not-started |  |
| SPEC-14.1-014 | 14.1 / 861 | - usage/latency/cost metadata | M4 | not-started |  |
| SECTION-14.2 | 14.2 / 863 | 14.2 OpenTelemetry | M4 | not-started |  |
| SPEC-14.2-001 | 14.2 / 865 | OTLP is the default transport. | M4 | not-started |  |
| SPEC-14.2-002 | 14.2 / 867 | AgentCI SHOULD map to current OpenTelemetry GenAI semantic conventions when stable/applicable and maintain an AgentCI namespaced compatibility layer while those conventions are still in development. | M4 | not-started |  |
| SECTION-14.3 | 14.3 / 869 | 14.3 Required AgentCI attributes | M4 | not-started |  |
| SPEC-14.3-001 | 14.3 / 871 | Suggested namespace: | M4 | not-started |  |
| SECTION-14.4 | 14.4 / 888 | 14.4 Content capture modes | M4 | not-started |  |
| SPEC-14.4-001 | 14.4 / 890 | - `none` - no model/tool content | M4 | not-started |  |
| SPEC-14.4-002 | 14.4 / 891 | - `metadata-only` | M4 | not-started |  |
| SPEC-14.4-003 | 14.4 / 892 | - `redacted` | M4 | not-started |  |
| SPEC-14.4-004 | 14.4 / 893 | - `full-encrypted` | M4 | not-started |  |
| SPEC-14.4-005 | 14.4 / 894 | - `customer-local` | M4 | not-started |  |
| SPEC-14.4-006 | 14.4 / 896 | Content capture MUST be configurable separately for: | M4 | not-started |  |
| SPEC-14.4-007 | 14.4 / 898 | - model input | M4 | not-started |  |
| SPEC-14.4-008 | 14.4 / 899 | - model output | M4 | not-started |  |
| SPEC-14.4-009 | 14.4 / 900 | - tool arguments | M4 | not-started |  |
| SPEC-14.4-010 | 14.4 / 901 | - tool output | M4 | not-started |  |
| SPEC-14.4-011 | 14.4 / 902 | - retrieved context | M4 | not-started |  |
| SPEC-14.4-012 | 14.4 / 903 | - system instructions | M4 | not-started |  |
| SECTION-14.5 | 14.5 / 905 | 14.5 SDKs | M4 | not-started |  |
| SPEC-14.5-001 | 14.5 / 907 | Initial SDKs: | M4 | not-started |  |
| SPEC-14.5-002 | 14.5 / 909 | - Python | M4 | not-started |  |
| SPEC-14.5-003 | 14.5 / 910 | - TypeScript/JavaScript | M4 | not-started |  |
| SPEC-14.5-004 | 14.5 / 912 | APIs should support: | M4 | not-started |  |
| SPEC-14.5-005 | 14.5 / 918 | and manual spans for custom agent frameworks. | M4 | not-started |  |
| SECTION-14.6 | 14.6 / 920 | 14.6 Trace correlation | M4 | not-started |  |
| SPEC-14.6-001 | 14.6 / 922 | All tool and downstream calls SHOULD propagate W3C trace context when possible. | M4 | not-started |  |
| SPEC-14.6-002 | 14.6 / 924 | For Kubernetes resources created by agent actions, optional metadata SHOULD include a safe correlation identifier, for example: | M4 | not-started |  |
| SPEC-14.6-003 | 14.6 / 933 | Use labels/annotations only where cardinality and sensitivity policies permit. | M4 | not-started |  |
| SECTION-15 | 15 / 937 | 15. MCP Gateway | M5 | not-started |  |
| SECTION-15.1 | 15.1 / 939 | 15.1 Purpose | M5 | not-started |  |
| SPEC-15.1-001 | 15.1 / 941 | The optional MCP Gateway mediates tool access without requiring changes to every MCP server. | M5 | not-started |  |
| SECTION-15.2 | 15.2 / 947 | 15.2 Responsibilities | M5 | not-started |  |
| SPEC-15.2-001 | 15.2 / 949 | - tool discovery normalization | M5 | not-started |  |
| SPEC-15.2-002 | 15.2 / 950 | - schema snapshotting | M5 | not-started |  |
| SPEC-15.2-003 | 15.2 / 951 | - namespaced disambiguation | M5 | not-started |  |
| SPEC-15.2-004 | 15.2 / 952 | - tracing | M5 | not-started |  |
| SPEC-15.2-005 | 15.2 / 953 | - authorization checks | M5 | not-started |  |
| SPEC-15.2-006 | 15.2 / 954 | - approval checks | M5 | not-started |  |
| SPEC-15.2-007 | 15.2 / 955 | - argument/output redaction | M5 | not-started |  |
| SPEC-15.2-008 | 15.2 / 956 | - rate limiting | M5 | not-started |  |
| SPEC-15.2-009 | 15.2 / 957 | - side-effect classification | M5 | not-started |  |
| SPEC-15.2-010 | 15.2 / 958 | - allow/deny/approval policy | M5 | not-started |  |
| SPEC-15.2-011 | 15.2 / 959 | - tool version/evidence recording | M5 | not-started |  |
| SECTION-15.3 | 15.3 / 961 | 15.3 Tool identity | M5 | not-started |  |
| SPEC-15.3-001 | 15.3 / 963 | Normalized ID SHOULD include server identity and tool name, for example: | M5 | not-started |  |
| SPEC-15.3-002 | 15.3 / 965 | `github.create_issue` or `prod-k8s.delete_namespace`. | M5 | not-started |  |
| SECTION-15.4 | 15.4 / 967 | 15.4 Trust boundary | M5 | not-started |  |
| SPEC-15.4-001 | 15.4 / 969 | Tool annotations and descriptions from untrusted MCP servers MUST NOT be trusted as authoritative security metadata. AgentCI policy may override or classify them. | M5 | not-started |  |
| SECTION-16 | 16 / 973 | 16. Evidence Graph | M1 | not-started |  |
| SECTION-16.1 | 16.1 / 975 | 16.1 Core entities | M1 | not-started |  |
| SPEC-16.1-001 | 16.1 / 977 | - Organization | M1 | not-started |  |
| SPEC-16.1-002 | 16.1 / 978 | - Project | M1 | not-started |  |
| SPEC-16.1-003 | 16.1 / 979 | - Repository | M1 | not-started |  |
| SPEC-16.1-004 | 16.1 / 980 | - Branch | M1 | not-started |  |
| SPEC-16.1-005 | 16.1 / 981 | - PullRequest | M1 | not-started |  |
| SPEC-16.1-006 | 16.1 / 982 | - Commit | M1 | not-started |  |
| SPEC-16.1-007 | 16.1 / 983 | - Requirement | M1 | not-started |  |
| SPEC-16.1-008 | 16.1 / 984 | - SpecRevision | M1 | not-started |  |
| SPEC-16.1-009 | 16.1 / 985 | - Capability | M1 | not-started |  |
| SPEC-16.1-010 | 16.1 / 986 | - Permission | M1 | not-started |  |
| SPEC-16.1-011 | 16.1 / 987 | - ToolDefinition | M1 | not-started |  |
| SPEC-16.1-012 | 16.1 / 988 | - PromptRevision | M1 | not-started |  |
| SPEC-16.1-013 | 16.1 / 989 | - PolicyRevision | M1 | not-started |  |
| SPEC-16.1-014 | 16.1 / 990 | - ModelRoute | M1 | not-started |  |
| SPEC-16.1-015 | 16.1 / 991 | - EvalSuite | M1 | not-started |  |
| SPEC-16.1-016 | 16.1 / 992 | - EvalScenario | M1 | not-started |  |
| SPEC-16.1-017 | 16.1 / 993 | - EvalRun | M1 | not-started |  |
| SPEC-16.1-018 | 16.1 / 994 | - Trace | M1 | not-started |  |
| SPEC-16.1-019 | 16.1 / 995 | - Finding | M1 | not-started |  |
| SPEC-16.1-020 | 16.1 / 996 | - Build | M1 | not-started |  |
| SPEC-16.1-021 | 16.1 / 997 | - Artifact | M1 | not-started |  |
| SPEC-16.1-022 | 16.1 / 998 | - Attestation | M1 | not-started |  |
| SPEC-16.1-023 | 16.1 / 999 | - AgentRelease | M1 | not-started |  |
| SPEC-16.1-024 | 16.1 / 1000 | - Deployment | M1 | not-started |  |
| SPEC-16.1-025 | 16.1 / 1001 | - ProductionOutcome | M1 | not-started |  |
| SPEC-16.1-026 | 16.1 / 1002 | - Incident | M1 | not-started |  |
| SPEC-16.1-027 | 16.1 / 1003 | - Regression | M1 | not-started |  |
| SPEC-16.1-028 | 16.1 / 1004 | - RepairAttempt | M1 | not-started |  |
| SPEC-16.1-029 | 16.1 / 1005 | - Approval | M1 | not-started |  |
| SECTION-16.2 | 16.2 / 1007 | 16.2 Important edges | M1 | not-started |  |
| SPEC-16.2-001 | 16.2 / 1009 | Examples: | M1 | not-started |  |
| SPEC-16.2-002 | 16.2 / 1011 | - `PullRequest CONTAINS Commit` | M1 | not-started |  |
| SPEC-16.2-003 | 16.2 / 1012 | - `Commit IMPLEMENTS Requirement` | M1 | not-started |  |
| SPEC-16.2-004 | 16.2 / 1013 | - `EvalScenario VERIFIES Requirement` | M1 | not-started |  |
| SPEC-16.2-005 | 16.2 / 1014 | - `EvalRun EXECUTED_AGAINST Commit` | M1 | not-started |  |
| SPEC-16.2-006 | 16.2 / 1015 | - `Trace PRODUCED_BY AgentRelease` | M1 | not-started |  |
| SPEC-16.2-007 | 16.2 / 1016 | - `Finding OBSERVED_IN PullRequest` | M1 | not-started |  |
| SPEC-16.2-008 | 16.2 / 1017 | - `Incident CORRELATED_WITH Trace` | M1 | not-started |  |
| SPEC-16.2-009 | 16.2 / 1018 | - `Regression DERIVED_FROM Incident` | M1 | not-started |  |
| SPEC-16.2-010 | 16.2 / 1019 | - `RepairAttempt FIXES Regression` | M1 | not-started |  |
| SPEC-16.2-011 | 16.2 / 1020 | - `AgentRelease ATTESTED_BY Attestation` | M1 | not-started |  |
| SPEC-16.2-012 | 16.2 / 1021 | - `Deployment DEPLOYS AgentRelease` | M1 | not-started |  |
| SECTION-16.3 | 16.3 / 1023 | 16.3 Storage approach | M1 | not-started |  |
| SPEC-16.3-001 | 16.3 / 1025 | V1 MAY use PostgreSQL with normalized tables plus JSONB and explicit edge tables. A graph database is not required initially. | M1 | not-started |  |
| SPEC-16.3-002 | 16.3 / 1027 | Requirements: | M1 | not-started |  |
| SPEC-16.3-003 | 16.3 / 1029 | - immutable evidence records where appropriate | M1 | not-started |  |
| SPEC-16.3-004 | 16.3 / 1030 | - versioned entities | M1 | not-started |  |
| SPEC-16.3-005 | 16.3 / 1031 | - stable UUIDs | M1 | not-started |  |
| SPEC-16.3-006 | 16.3 / 1032 | - organization/tenant isolation | M1 | not-started |  |
| SPEC-16.3-007 | 16.3 / 1033 | - retention policies | M1 | not-started |  |
| SPEC-16.3-008 | 16.3 / 1034 | - query by PR/commit/release/incident/requirement | M1 | not-started |  |
| SECTION-16.4 | 16.4 / 1036 | 16.4 Evidence confidence | M1 | not-started |  |
| SPEC-16.4-001 | 16.4 / 1038 | Each evidence claim SHOULD store: | M1 | not-started |  |
| SPEC-16.4-002 | 16.4 / 1040 | - source type | M1 | not-started |  |
| SPEC-16.4-003 | 16.4 / 1041 | - confidence | M1 | not-started |  |
| SPEC-16.4-004 | 16.4 / 1042 | - verification status | M1 | not-started |  |
| SPEC-16.4-005 | 16.4 / 1043 | - timestamp | M1 | not-started |  |
| SPEC-16.4-006 | 16.4 / 1044 | - producer/version | M1 | not-started |  |
| SECTION-17 | 17 / 1048 | 17. GitHub Integration | M1 | not-started |  |
| SECTION-17.1 | 17.1 / 1050 | 17.1 GitHub App permissions | M1 | not-started |  |
| SPEC-17.1-001 | 17.1 / 1052 | Minimum permissions should be determined during implementation, but likely include: | M1 | not-started |  |
| SPEC-17.1-002 | 17.1 / 1054 | - metadata read | M1 | not-started |  |
| SPEC-17.1-003 | 17.1 / 1055 | - contents read (or write only if auto-fix branches enabled) | M1 | not-started |  |
| SPEC-17.1-004 | 17.1 / 1056 | - pull requests read/write for comments/metadata as needed | M1 | not-started |  |
| SPEC-17.1-005 | 17.1 / 1057 | - checks write | M1 | not-started |  |
| SPEC-17.1-006 | 17.1 / 1059 | Use least privilege and request write permissions only when feature enabled. | M1 | not-started |  |
| SECTION-17.2 | 17.2 / 1061 | 17.2 Webhooks | M1 | not-started |  |
| SPEC-17.2-001 | 17.2 / 1063 | Support relevant events such as: | M1 | not-started |  |
| SPEC-17.2-002 | 17.2 / 1065 | - pull_request opened/synchronize/reopened/closed | M1 | not-started |  |
| SPEC-17.2-003 | 17.2 / 1066 | - push | M1 | not-started |  |
| SPEC-17.2-004 | 17.2 / 1067 | - check_run requested_action | M1 | not-started |  |
| SPEC-17.2-005 | 17.2 / 1068 | - installation / repository changes | M1 | not-started |  |
| SECTION-17.3 | 17.3 / 1070 | 17.3 Check structure | M1 | not-started |  |
| SPEC-17.3-001 | 17.3 / 1072 | Primary required check: | M1 | not-started |  |
| SPEC-17.3-002 | 17.3 / 1074 | `agentci/review` | M1 | not-started |  |
| SPEC-17.3-003 | 17.3 / 1076 | Optional subchecks: | M1 | not-started |  |
| SPEC-17.3-004 | 17.3 / 1078 | - `agentci/spec` | M1 | not-started |  |
| SPEC-17.3-005 | 17.3 / 1079 | - `agentci/risk` | M1 | not-started |  |
| SPEC-17.3-006 | 17.3 / 1080 | - `agentci/evals` | M1 | not-started |  |
| SPEC-17.3-007 | 17.3 / 1081 | - `agentci/security` | M1 | not-started |  |
| SPEC-17.3-008 | 17.3 / 1082 | - `agentci/model-review` | M1 | not-started |  |
| SECTION-17.4 | 17.4 / 1084 | 17.4 PR output | M1 | not-started |  |
| SPEC-17.4-001 | 17.4 / 1086 | The check MUST contain: | M1 | not-started |  |
| SPEC-17.4-002 | 17.4 / 1088 | - overall status | M1 | not-started |  |
| SPEC-17.4-003 | 17.4 / 1089 | - risk level | M1 | not-started |  |
| SPEC-17.4-004 | 17.4 / 1090 | - changed requirements | M1 | not-started |  |
| SPEC-17.4-005 | 17.4 / 1091 | - changed capabilities | M1 | not-started |  |
| SPEC-17.4-006 | 17.4 / 1092 | - changed permissions | M1 | not-started |  |
| SPEC-17.4-007 | 17.4 / 1093 | - model/tool/policy changes | M1 | not-started |  |
| SPEC-17.4-008 | 17.4 / 1094 | - eval result summary | M1 | not-started |  |
| SPEC-17.4-009 | 17.4 / 1095 | - confirmed findings | M1 | not-started |  |
| SPEC-17.4-010 | 17.4 / 1096 | - unresolved high-confidence findings | M1 | not-started |  |
| SPEC-17.4-011 | 17.4 / 1097 | - links to detailed evidence | M1 | not-started |  |
| SPEC-17.4-012 | 17.4 / 1099 | Annotations SHOULD be attached to source lines where findings map to concrete lines. | M1 | not-started |  |
| SECTION-17.5 | 17.5 / 1101 | 17.5 Requested actions | M1 | not-started |  |
| SPEC-17.5-001 | 17.5 / 1103 | Where supported, actions may include: | M1 | not-started |  |
| SPEC-17.5-002 | 17.5 / 1105 | - Re-run targeted evals | M1 | not-started |  |
| SPEC-17.5-003 | 17.5 / 1106 | - Generate reproduction | M1 | not-started |  |
| SPEC-17.5-004 | 17.5 / 1107 | - Propose fix | M1 | not-started |  |
| SPEC-17.5-005 | 17.5 / 1108 | - Explain finding | M1 | not-started |  |
| SPEC-17.5-006 | 17.5 / 1109 | - Mark expected behavior | M1 | not-started |  |
| SPEC-17.5-007 | 17.5 / 1111 | No requested action may silently merge or deploy without corresponding authorization. | M1 | not-started |  |
| SECTION-18 | 18 / 1115 | 18. CI Integration Architecture | M2 | not-started |  |
| SECTION-18.1 | 18.1 / 1117 | 18.1 Adapter contract | M2 | not-started |  |
| SECTION-18.2 | 18.2 / 1128 | 18.2 Supported modes | M2 | not-started |  |
| SPEC-18.2-001 | 18.2 / 1130 | - AgentCI-managed runners | M2 | not-started |  |
| SPEC-18.2-002 | 18.2 / 1131 | - customer-managed runners | M2 | not-started |  |
| SPEC-18.2-003 | 18.2 / 1132 | - GitHub Actions adapter | M2 | not-started |  |
| SPEC-18.2-004 | 18.2 / 1133 | - Tekton adapter | M2 | not-started |  |
| SPEC-18.2-005 | 18.2 / 1134 | - webhook/REST generic adapter | M2 | not-started |  |
| SECTION-18.3 | 18.3 / 1136 | 18.3 Runner isolation | M2 | not-started |  |
| SPEC-18.3-001 | 18.3 / 1138 | Eval runners processing untrusted PR code MUST support: | M2 | not-started |  |
| SPEC-18.3-002 | 18.3 / 1140 | - isolated container/VM/pod | M2 | not-started |  |
| SPEC-18.3-003 | 18.3 / 1141 | - restricted network policy | M2 | not-started |  |
| SPEC-18.3-004 | 18.3 / 1142 | - read-only credentials by default | M2 | not-started |  |
| SPEC-18.3-005 | 18.3 / 1143 | - ephemeral workspaces | M2 | not-started |  |
| SPEC-18.3-006 | 18.3 / 1144 | - resource quotas | M2 | not-started |  |
| SPEC-18.3-007 | 18.3 / 1145 | - timeouts | M2 | not-started |  |
| SPEC-18.3-008 | 18.3 / 1146 | - artifact scanning | M2 | not-started |  |
| SECTION-19 | 19 / 1150 | 19. Tekton and OpenShift Pipelines Integration | M7 | not-started |  |
| SECTION-19.1 | 19.1 / 1152 | 19.1 Design principle | M7 | not-started |  |
| SPEC-19.1-001 | 19.1 / 1154 | Tekton remains an execution engine. AgentCI supplies tasks, orchestration metadata, evidence contracts, and optional controllers. | M7 | not-started |  |
| SECTION-19.2 | 19.2 / 1156 | 19.2 Reusable Tekton tasks | M7 | not-started |  |
| SPEC-19.2-001 | 19.2 / 1158 | Provide catalog tasks: | M7 | not-started |  |
| SPEC-19.2-002 | 19.2 / 1160 | - `agentci-semantic-diff` | M7 | not-started |  |
| SPEC-19.2-003 | 19.2 / 1161 | - `agentci-risk` | M7 | not-started |  |
| SPEC-19.2-004 | 19.2 / 1162 | - `agentci-eval` | M7 | not-started |  |
| SPEC-19.2-005 | 19.2 / 1163 | - `agentci-model-review` | M7 | not-started |  |
| SPEC-19.2-006 | 19.2 / 1164 | - `agentci-evidence-publish` | M7 | not-started |  |
| SPEC-19.2-007 | 19.2 / 1165 | - `agentci-release-attest` | M7 | not-started |  |
| SPEC-19.2-008 | 19.2 / 1166 | - `agentci-regression-replay` | M7 | not-started |  |
| SECTION-19.3 | 19.3 / 1168 | 19.3 Pipelines as Code | M7 | not-started |  |
| SPEC-19.3-001 | 19.3 / 1170 | Provide example `.tekton/agentci-pr.yaml` triggering on PR events. | M7 | not-started |  |
| SPEC-19.3-002 | 19.3 / 1172 | Example conceptual pipeline: | M7 | not-started |  |
| SECTION-19.4 | 19.4 / 1185 | 19.4 Tekton Results | M7 | not-started |  |
| SPEC-19.4-001 | 19.4 / 1187 | Where deployed, reference Tekton Results records rather than duplicating complete pipeline logs. Evidence Graph SHOULD store durable linkage and normalized summaries. | M7 | not-started |  |
| SECTION-19.5 | 19.5 / 1189 | 19.5 Tekton Chains | M7 | not-started |  |
| SPEC-19.5-001 | 19.5 / 1191 | AgentCI SHOULD integrate release evidence with Tekton Chains/signing so an AgentRelease can reference signed pipeline provenance. | M7 | not-started |  |
| SPEC-19.5-002 | 19.5 / 1193 | Agent-specific attestation subject should include immutable release inputs such as: | M7 | not-started |  |
| SPEC-19.5-003 | 19.5 / 1195 | - source commit | M7 | not-started |  |
| SPEC-19.5-004 | 19.5 / 1196 | - image digest | M7 | not-started |  |
| SPEC-19.5-005 | 19.5 / 1197 | - spec digest | M7 | not-started |  |
| SPEC-19.5-006 | 19.5 / 1198 | - prompt digest | M7 | not-started |  |
| SPEC-19.5-007 | 19.5 / 1199 | - policy digest | M7 | not-started |  |
| SPEC-19.5-008 | 19.5 / 1200 | - eval-suite digest | M7 | not-started |  |
| SPEC-19.5-009 | 19.5 / 1201 | - model route/policy digest | M7 | not-started |  |
| SPEC-19.5-010 | 19.5 / 1202 | - evidence bundle digest | M7 | not-started |  |
| SECTION-20 | 20 / 1206 | 20. OpenShift Distribution | M7 | not-started |  |
| SECTION-20.1 | 20.1 / 1208 | 20.1 Packaging | M7 | not-started |  |
| SPEC-20.1-001 | 20.1 / 1210 | Provide an optional OpenShift-native distribution containing: | M7 | not-started |  |
| SPEC-20.1-002 | 20.1 / 1212 | - Operator/OLM bundle | M7 | not-started |  |
| SPEC-20.1-003 | 20.1 / 1213 | - AgentCI Controller | M7 | not-started |  |
| SPEC-20.1-004 | 20.1 / 1214 | - Tekton Task catalog | M7 | not-started |  |
| SPEC-20.1-005 | 20.1 / 1215 | - Pipelines as Code examples/integration | M7 | not-started |  |
| SPEC-20.1-006 | 20.1 / 1216 | - Tekton Results integration | M7 | not-started |  |
| SPEC-20.1-007 | 20.1 / 1217 | - Tekton Chains integration | M7 | not-started |  |
| SPEC-20.1-008 | 20.1 / 1218 | - OpenShift OAuth/RBAC integration | M7 | not-started |  |
| SPEC-20.1-009 | 20.1 / 1219 | - Console dynamic plugin (later phase) | M7 | not-started |  |
| SPEC-20.1-010 | 20.1 / 1220 | - OpenShift GitOps integration | M7 | not-started |  |
| SPEC-20.1-011 | 20.1 / 1221 | - OpenTelemetry integration | M7 | not-started |  |
| SECTION-20.2 | 20.2 / 1223 | 20.2 CRDs | M7 | not-started |  |
| SECTION-20.3 | 20.3 / 1291 | 20.3 Operator responsibilities | M7 | not-started |  |
| SPEC-20.3-001 | 20.3 / 1293 | The operator MAY: | M7 | not-started |  |
| SPEC-20.3-002 | 20.3 / 1295 | - validate CRDs | M7 | not-started |  |
| SPEC-20.3-003 | 20.3 / 1296 | - reconcile release evidence status | M7 | not-started |  |
| SPEC-20.3-004 | 20.3 / 1297 | - expose Kubernetes conditions | M7 | not-started |  |
| SPEC-20.3-005 | 20.3 / 1298 | - integrate with Tekton results | M7 | not-started |  |
| SPEC-20.3-006 | 20.3 / 1299 | - coordinate promotion gates | M7 | not-started |  |
| SPEC-20.3-007 | 20.3 / 1300 | - configure optional telemetry resources | M7 | not-started |  |
| SPEC-20.3-008 | 20.3 / 1302 | It SHOULD NOT become a replacement for Argo CD or Tekton. | M7 | not-started |  |
| SECTION-21 | 21 / 1306 | 21. Release Evidence and `AgentRelease` | M6 | not-started |  |
| SECTION-21.1 | 21.1 / 1308 | 21.1 Release identity | M6 | not-started |  |
| SPEC-21.1-001 | 21.1 / 1310 | An AgentRelease MUST be immutable after verification. Changes create a new release identity. | M6 | not-started |  |
| SECTION-21.2 | 21.2 / 1312 | 21.2 Required digests | M6 | not-started |  |
| SPEC-21.2-001 | 21.2 / 1314 | Where applicable: | M6 | not-started |  |
| SPEC-21.2-002 | 21.2 / 1316 | - source SHA | M6 | not-started |  |
| SPEC-21.2-003 | 21.2 / 1317 | - build artifact digest | M6 | not-started |  |
| SPEC-21.2-004 | 21.2 / 1318 | - spec digest | M6 | not-started |  |
| SPEC-21.2-005 | 21.2 / 1319 | - prompt/instructions digest | M6 | not-started |  |
| SPEC-21.2-006 | 21.2 / 1320 | - tool-definition digest | M6 | not-started |  |
| SPEC-21.2-007 | 21.2 / 1321 | - permission/policy digest | M6 | not-started |  |
| SPEC-21.2-008 | 21.2 / 1322 | - model routing policy digest | M6 | not-started |  |
| SPEC-21.2-009 | 21.2 / 1323 | - eval suite digest | M6 | not-started |  |
| SPEC-21.2-010 | 21.2 / 1324 | - evidence bundle digest | M6 | not-started |  |
| SECTION-21.3 | 21.3 / 1326 | 21.3 Example evidence bundle | M6 | not-started |  |
| SECTION-22 | 22 / 1349 | 22. Deployment and Promotion | M6 | not-started |  |
| SECTION-22.1 | 22.1 / 1351 | 22.1 Promotion stages | M6 | not-started |  |
| SPEC-22.1-001 | 22.1 / 1353 | Support configurable stages such as: | M6 | not-started |  |
| SPEC-22.1-002 | 22.1 / 1355 | - offline eval | M6 | not-started |  |
| SPEC-22.1-003 | 22.1 / 1356 | - sandbox | M6 | not-started |  |
| SPEC-22.1-004 | 22.1 / 1357 | - shadow | M6 | not-started |  |
| SPEC-22.1-005 | 22.1 / 1358 | - read-only | M6 | not-started |  |
| SPEC-22.1-006 | 22.1 / 1359 | - approval-required actions | M6 | not-started |  |
| SPEC-22.1-007 | 22.1 / 1360 | - canary | M6 | not-started |  |
| SPEC-22.1-008 | 22.1 / 1361 | - broader production | M6 | not-started |  |
| SPEC-22.1-009 | 22.1 / 1362 | - full production | M6 | not-started |  |
| SECTION-22.2 | 22.2 / 1364 | 22.2 Argo CD | M6 | not-started |  |
| SPEC-22.2-001 | 22.2 / 1366 | AgentCI MAY provide PreSync/PostSync hooks or resource health integration but SHOULD not replace Argo CD's Git reconciliation. | M6 | not-started |  |
| SECTION-22.3 | 22.3 / 1368 | 22.3 Argo Rollouts | M6 | not-started |  |
| SPEC-22.3-001 | 22.3 / 1370 | Integrate AgentCI production metrics/evidence with progressive delivery analysis when useful. Release promotion may be blocked or aborted based on configured behavioral metrics. | M6 | not-started |  |
| SECTION-22.4 | 22.4 / 1372 | 22.4 Promotion decision record | M6 | not-started |  |
| SPEC-22.4-001 | 22.4 / 1374 | Every automated promotion/rollback decision MUST record: | M6 | not-started |  |
| SPEC-22.4-002 | 22.4 / 1376 | - evaluated release | M6 | not-started |  |
| SPEC-22.4-003 | 22.4 / 1377 | - policy revision | M6 | not-started |  |
| SPEC-22.4-004 | 22.4 / 1378 | - evidence inputs | M6 | not-started |  |
| SPEC-22.4-005 | 22.4 / 1379 | - metric window | M6 | not-started |  |
| SPEC-22.4-006 | 22.4 / 1380 | - decision | M6 | not-started |  |
| SPEC-22.4-007 | 22.4 / 1381 | - actor/system identity | M6 | not-started |  |
| SPEC-22.4-008 | 22.4 / 1382 | - timestamp | M6 | not-started |  |
| SECTION-23 | 23 / 1386 | 23. Production Telemetry Ingestion | M8 | not-started |  |
| SECTION-23.1 | 23.1 / 1388 | 23.1 Sources | M8 | not-started |  |
| SPEC-23.1-001 | 23.1 / 1390 | Support: | M8 | not-started |  |
| SPEC-23.1-002 | 23.1 / 1392 | - AgentCI SDK spans | M8 | not-started |  |
| SPEC-23.1-003 | 23.1 / 1393 | - generic OTLP | M8 | not-started |  |
| SPEC-23.1-004 | 23.1 / 1394 | - MCP Gateway events | M8 | not-started |  |
| SPEC-23.1-005 | 23.1 / 1395 | - application logs/metrics through adapters | M8 | not-started |  |
| SPEC-23.1-006 | 23.1 / 1396 | - Kubernetes events | M8 | not-started |  |
| SPEC-23.1-007 | 23.1 / 1397 | - audit logs where configured | M8 | not-started |  |
| SPEC-23.1-008 | 23.1 / 1398 | - Sentry-like errors | M8 | not-started |  |
| SPEC-23.1-009 | 23.1 / 1399 | - PagerDuty-like incidents | M8 | not-started |  |
| SPEC-23.1-010 | 23.1 / 1400 | - user feedback events | M8 | not-started |  |
| SPEC-23.1-011 | 23.1 / 1401 | - business KPI/invariant signals | M8 | not-started |  |
| SECTION-23.2 | 23.2 / 1403 | 23.2 Error/outcome taxonomy | M8 | not-started |  |
| SPEC-23.2-001 | 23.2 / 1405 | An "error" may be: | M8 | not-started |  |
| SPEC-23.2-002 | 23.2 / 1407 | - technical failure | M8 | not-started |  |
| SPEC-23.2-003 | 23.2 / 1408 | - policy failure | M8 | not-started |  |
| SPEC-23.2-004 | 23.2 / 1409 | - safety violation | M8 | not-started |  |
| SPEC-23.2-005 | 23.2 / 1410 | - business invariant violation | M8 | not-started |  |
| SPEC-23.2-006 | 23.2 / 1411 | - incorrect task outcome | M8 | not-started |  |
| SPEC-23.2-007 | 23.2 / 1412 | - human negative feedback | M8 | not-started |  |
| SPEC-23.2-008 | 23.2 / 1413 | - excessive cost/latency | M8 | not-started |  |
| SPEC-23.2-009 | 23.2 / 1414 | - anomalous behavior | M8 | not-started |  |
| SPEC-23.2-010 | 23.2 / 1415 | - external side effect mismatch | M8 | not-started |  |
| SECTION-23.3 | 23.3 / 1417 | 23.3 Business outcome API | M8 | not-started |  |
| SPEC-23.3-001 | 23.3 / 1419 | Applications SHOULD be able to report outcomes: | M8 | not-started |  |
| SPEC-23.3-002 | 23.3 / 1435 | Sensitive metadata must follow redaction policy. | M8 | not-started |  |
| SECTION-24 | 24 / 1439 | 24. Incident Correlation | M8 | not-started |  |
| SECTION-24.1 | 24.1 / 1441 | 24.1 Incident candidate triggers | M8 | not-started |  |
| SPEC-24.1-001 | 24.1 / 1443 | - direct error span | M8 | not-started |  |
| SPEC-24.1-002 | 24.1 / 1444 | - policy violation | M8 | not-started |  |
| SPEC-24.1-003 | 24.1 / 1445 | - alert integration | M8 | not-started |  |
| SPEC-24.1-004 | 24.1 / 1446 | - anomaly threshold | M8 | not-started |  |
| SPEC-24.1-005 | 24.1 / 1447 | - user feedback | M8 | not-started |  |
| SPEC-24.1-006 | 24.1 / 1448 | - business invariant failure | M8 | not-started |  |
| SPEC-24.1-007 | 24.1 / 1449 | - deployment regression | M8 | not-started |  |
| SECTION-24.2 | 24.2 / 1451 | 24.2 Correlation signals | M8 | not-started |  |
| SPEC-24.2-001 | 24.2 / 1453 | - shared trace ID | M8 | not-started |  |
| SPEC-24.2-002 | 24.2 / 1454 | - release ID | M8 | not-started |  |
| SPEC-24.2-003 | 24.2 / 1455 | - git SHA | M8 | not-started |  |
| SPEC-24.2-004 | 24.2 / 1456 | - time proximity | M8 | not-started |  |
| SPEC-24.2-005 | 24.2 / 1457 | - resource identity | M8 | not-started |  |
| SPEC-24.2-006 | 24.2 / 1458 | - deployment version | M8 | not-started |  |
| SPEC-24.2-007 | 24.2 / 1459 | - causal parent/child spans | M8 | not-started |  |
| SPEC-24.2-008 | 24.2 / 1460 | - tool side-effect target | M8 | not-started |  |
| SECTION-24.3 | 24.3 / 1462 | 24.3 Correlation confidence | M8 | not-started |  |
| SPEC-24.3-001 | 24.3 / 1464 | Store correlation confidence and evidence; do not assert causality solely from time adjacency. | M8 | not-started |  |
| SECTION-25 | 25 / 1468 | 25. Replay and Reproduction | M9 | not-started |  |
| SECTION-25.1 | 25.1 / 1470 | 25.1 Modes | M9 | not-started |  |
| SPEC-25.1-001 | 25.1 / 1474 | Replay model/tool outputs from captured fixtures. Fast and safe, but validates orchestration more than external reality. | M9 | not-started |  |
| SPEC-25.1-002 | 25.1 / 1478 | Use generated or curated environment state. | M9 | not-started |  |
| SPEC-25.1-003 | 25.1 / 1482 | Provision isolated resources and execute real code/tools against them. | M9 | not-started |  |
| SECTION-25.2 | 25.2 / 1484 | 25.2 Replay package | M9 | not-started |  |
| SPEC-25.2-001 | 25.2 / 1486 | A replay package may contain: | M9 | not-started |  |
| SPEC-25.2-002 | 25.2 / 1488 | - AgentRelease identity | M9 | not-started |  |
| SPEC-25.2-003 | 25.2 / 1489 | - input event | M9 | not-started |  |
| SPEC-25.2-004 | 25.2 / 1490 | - sanitized model request/response fixtures | M9 | not-started |  |
| SPEC-25.2-005 | 25.2 / 1491 | - tool schemas | M9 | not-started |  |
| SPEC-25.2-006 | 25.2 / 1492 | - captured tool responses | M9 | not-started |  |
| SPEC-25.2-007 | 25.2 / 1493 | - relevant environment snapshot | M9 | not-started |  |
| SPEC-25.2-008 | 25.2 / 1494 | - expected outcome | M9 | not-started |  |
| SPEC-25.2-009 | 25.2 / 1495 | - policy revision | M9 | not-started |  |
| SECTION-25.3 | 25.3 / 1497 | 25.3 Replay privacy | M9 | not-started |  |
| SPEC-25.3-001 | 25.3 / 1499 | Replay packages MUST respect capture policy and SHOULD support local-only storage. | M9 | not-started |  |
| SECTION-25.4 | 25.4 / 1501 | 25.4 Reproduction criteria | M9 | not-started |  |
| SPEC-25.4-001 | 25.4 / 1503 | Incident can be marked reproducible only if configured threshold is met, e.g. `>= 3/5` failures or deterministic reproduction. | M9 | not-started |  |
| SECTION-26 | 26 / 1507 | 26. Regression Generation | M9 | not-started |  |
| SECTION-26.1 | 26.1 / 1509 | 26.1 Input | M9 | not-started |  |
| SPEC-26.1-001 | 26.1 / 1511 | - confirmed incident | M9 | not-started |  |
| SPEC-26.1-002 | 26.1 / 1512 | - actual behavior | M9 | not-started |  |
| SPEC-26.1-003 | 26.1 / 1513 | - desired/expected behavior | M9 | not-started |  |
| SPEC-26.1-004 | 26.1 / 1514 | - minimized reproduction context | M9 | not-started |  |
| SECTION-26.2 | 26.2 / 1516 | 26.2 Output | M9 | not-started |  |
| SPEC-26.2-001 | 26.2 / 1518 | A committed or stored regression case with stable ID. | M9 | not-started |  |
| SPEC-26.2-002 | 26.2 / 1520 | Example: | M9 | not-started |  |
| SECTION-26.3 | 26.3 / 1540 | 26.3 Human review | M9 | not-started |  |
| SPEC-26.3-001 | 26.3 / 1542 | For high-impact incidents, generated regression expectations SHOULD require human approval before becoming authoritative if the expected behavior was inferred rather than explicit in existing specification/policy. | M9 | not-started |  |
| SECTION-27 | 27 / 1546 | 27. Root Cause and Repair Orchestration | M10 | not-started |  |
| SECTION-27.1 | 27.1 / 1548 | 27.1 Root-cause classes | M10 | not-started |  |
| SPEC-27.1-001 | 27.1 / 1550 | - implementation/code | M10 | not-started |  |
| SPEC-27.1-002 | 27.1 / 1551 | - specification gap | M10 | not-started |  |
| SPEC-27.1-003 | 27.1 / 1552 | - prompt/instruction | M10 | not-started |  |
| SPEC-27.1-004 | 27.1 / 1553 | - tool schema/design | M10 | not-started |  |
| SPEC-27.1-005 | 27.1 / 1554 | - policy | M10 | not-started |  |
| SPEC-27.1-006 | 27.1 / 1555 | - model behavior | M10 | not-started |  |
| SPEC-27.1-007 | 27.1 / 1556 | - model routing | M10 | not-started |  |
| SPEC-27.1-008 | 27.1 / 1557 | - retrieval/data | M10 | not-started |  |
| SPEC-27.1-009 | 27.1 / 1558 | - memory/state | M10 | not-started |  |
| SPEC-27.1-010 | 27.1 / 1559 | - infrastructure | M10 | not-started |  |
| SPEC-27.1-011 | 27.1 / 1560 | - external dependency | M10 | not-started |  |
| SECTION-27.2 | 27.2 / 1562 | 27.2 Candidate fix workflow | M10 | not-started |  |
| SPEC-27.2-001 | 27.2 / 1564 | 1. Gather incident evidence. | M10 | not-started |  |
| SPEC-27.2-002 | 27.2 / 1565 | 2. Produce root-cause hypotheses from one or more analyzers. | M10 | not-started |  |
| SPEC-27.2-003 | 27.2 / 1566 | 3. Attempt validations. | M10 | not-started |  |
| SPEC-27.2-004 | 27.2 / 1567 | 4. Create N candidate patches if appropriate. | M10 | not-started |  |
| SPEC-27.2-005 | 27.2 / 1568 | 5. Run new regression. | M10 | not-started |  |
| SPEC-27.2-006 | 27.2 / 1569 | 6. Run affected suite. | M10 | not-started |  |
| SPEC-27.2-007 | 27.2 / 1570 | 7. Run required full suite based on risk. | M10 | not-started |  |
| SPEC-27.2-008 | 27.2 / 1571 | 8. Run security and policy checks. | M10 | not-started |  |
| SPEC-27.2-009 | 27.2 / 1572 | 9. Compare candidate evidence. | M10 | not-started |  |
| SPEC-27.2-010 | 27.2 / 1573 | 10. Create branch/PR only if autonomy policy permits. | M10 | not-started |  |
| SECTION-27.3 | 27.3 / 1575 | 27.3 Candidate selection | M10 | not-started |  |
| SPEC-27.3-001 | 27.3 / 1577 | Do not select by LLM preference alone. Prefer evidence including: | M10 | not-started |  |
| SPEC-27.3-002 | 27.3 / 1579 | - regression pass | M10 | not-started |  |
| SPEC-27.3-003 | 27.3 / 1580 | - full-suite non-regression | M10 | not-started |  |
| SPEC-27.3-004 | 27.3 / 1581 | - deterministic tests | M10 | not-started |  |
| SPEC-27.3-005 | 27.3 / 1582 | - smaller blast radius | M10 | not-started |  |
| SPEC-27.3-006 | 27.3 / 1583 | - lower complexity | M10 | not-started |  |
| SPEC-27.3-007 | 27.3 / 1584 | - policy compliance | M10 | not-started |  |
| SPEC-27.3-008 | 27.3 / 1585 | - performance/cost impact | M10 | not-started |  |
| SECTION-28 | 28 / 1589 | 28. Autonomy Model | M10 | not-started |  |
| SECTION-28.1 | 28.1 / 1591 | 28.1 Independent permissions | M10 | not-started |  |
| SPEC-28.1-001 | 28.1 / 1593 | Configurable actions: | M10 | not-started |  |
| SPEC-28.1-002 | 28.1 / 1595 | - `detect` | M10 | not-started |  |
| SPEC-28.1-003 | 28.1 / 1596 | - `diagnose` | M10 | not-started |  |
| SPEC-28.1-004 | 28.1 / 1597 | - `create_regression` | M10 | not-started |  |
| SPEC-28.1-005 | 28.1 / 1598 | - `generate_patch` | M10 | not-started |  |
| SPEC-28.1-006 | 28.1 / 1599 | - `create_branch` | M10 | not-started |  |
| SPEC-28.1-007 | 28.1 / 1600 | - `open_pr` | M10 | not-started |  |
| SPEC-28.1-008 | 28.1 / 1601 | - `approve_pr` | M10 | not-started |  |
| SPEC-28.1-009 | 28.1 / 1602 | - `merge_pr` | M10 | not-started |  |
| SPEC-28.1-010 | 28.1 / 1603 | - `deploy_nonprod` | M10 | not-started |  |
| SPEC-28.1-011 | 28.1 / 1604 | - `deploy_prod` | M10 | not-started |  |
| SPEC-28.1-012 | 28.1 / 1605 | - `rollback` | M10 | not-started |  |
| SPEC-28.1-013 | 28.1 / 1606 | - `execute_prod_remediation` | M10 | not-started |  |
| SECTION-28.2 | 28.2 / 1608 | 28.2 Suggested default | M10 | not-started |  |
| SPEC-28.2-001 | 28.2 / 1610 | Initial product defaults: | M10 | not-started |  |
| SPEC-28.2-002 | 28.2 / 1612 | - detect: auto | M10 | not-started |  |
| SPEC-28.2-003 | 28.2 / 1613 | - diagnose: auto | M10 | not-started |  |
| SPEC-28.2-004 | 28.2 / 1614 | - create_regression: auto-draft | M10 | not-started |  |
| SPEC-28.2-005 | 28.2 / 1615 | - generate_patch: auto | M10 | not-started |  |
| SPEC-28.2-006 | 28.2 / 1616 | - create_branch: allowed | M10 | not-started |  |
| SPEC-28.2-007 | 28.2 / 1617 | - open_pr: allowed | M10 | not-started |  |
| SPEC-28.2-008 | 28.2 / 1618 | - approve_pr: human | M10 | not-started |  |
| SPEC-28.2-009 | 28.2 / 1619 | - merge_pr: human | M10 | not-started |  |
| SPEC-28.2-010 | 28.2 / 1620 | - deploy_nonprod: existing CI/CD policy | M10 | not-started |  |
| SPEC-28.2-011 | 28.2 / 1621 | - deploy_prod: existing policy/human | M10 | not-started |  |
| SPEC-28.2-012 | 28.2 / 1622 | - rollback: existing rollout policy | M10 | not-started |  |
| SPEC-28.2-013 | 28.2 / 1623 | - prod remediation: human approval | M10 | not-started |  |
| SECTION-29 | 29 / 1627 | 29. Security Architecture | M1 | not-started |  |
| SECTION-29.1 | 29.1 / 1629 | 29.1 Threats | M1 | not-started |  |
| SPEC-29.1-001 | 29.1 / 1631 | At minimum consider: | M1 | not-started |  |
| SPEC-29.1-002 | 29.1 / 1633 | - prompt injection through code/issues/docs | M1 | not-started |  |
| SPEC-29.1-003 | 29.1 / 1634 | - malicious PR trying to manipulate reviewer agents | M1 | not-started |  |
| SPEC-29.1-004 | 29.1 / 1635 | - tool-schema poisoning | M1 | not-started |  |
| SPEC-29.1-005 | 29.1 / 1636 | - MCP server impersonation | M1 | not-started |  |
| SPEC-29.1-006 | 29.1 / 1637 | - secret exfiltration | M1 | not-started |  |
| SPEC-29.1-007 | 29.1 / 1638 | - cross-tenant data leakage | M1 | not-started |  |
| SPEC-29.1-008 | 29.1 / 1639 | - compromised model provider credentials | M1 | not-started |  |
| SPEC-29.1-009 | 29.1 / 1640 | - poisoned eval fixtures | M1 | not-started |  |
| SPEC-29.1-010 | 29.1 / 1641 | - CI runner escape | M1 | not-started |  |
| SPEC-29.1-011 | 29.1 / 1642 | - unauthorized auto-fix writes | M1 | not-started |  |
| SPEC-29.1-012 | 29.1 / 1643 | - evidence tampering | M1 | not-started |  |
| SPEC-29.1-013 | 29.1 / 1644 | - replaying stale approvals | M1 | not-started |  |
| SPEC-29.1-014 | 29.1 / 1645 | - supply-chain compromise | M1 | not-started |  |
| SECTION-29.2 | 29.2 / 1647 | 29.2 Identity model | M1 | not-started |  |
| SPEC-29.2-001 | 29.2 / 1649 | Distinguish: | M1 | not-started |  |
| SPEC-29.2-002 | 29.2 / 1651 | - human user identity | M1 | not-started |  |
| SPEC-29.2-003 | 29.2 / 1652 | - AgentCI service identity | M1 | not-started |  |
| SPEC-29.2-004 | 29.2 / 1653 | - coding/reviewer agent identity | M1 | not-started |  |
| SPEC-29.2-005 | 29.2 / 1654 | - model provider identity | M1 | not-started |  |
| SPEC-29.2-006 | 29.2 / 1655 | - tool/MCP server identity | M1 | not-started |  |
| SPEC-29.2-007 | 29.2 / 1656 | - workload identity | M1 | not-started |  |
| SPEC-29.2-008 | 29.2 / 1657 | - delegated "acting on behalf of" identity | M1 | not-started |  |
| SPEC-29.2-009 | 29.2 / 1659 | Audit records should permit a statement like: | M1 | not-started |  |
| SPEC-29.2-010 | 29.2 / 1661 | `agent:sre@4.1 acting-on-behalf-of user:alice invoked tool:k8s.restart under policy:PROD-28`. | M1 | not-started |  |
| SECTION-29.3 | 29.3 / 1663 | 29.3 Secrets | M1 | not-started |  |
| SPEC-29.3-001 | 29.3 / 1665 | - never embed provider keys in repository configuration | M1 | not-started |  |
| SPEC-29.3-002 | 29.3 / 1666 | - integrate with secrets manager/Kubernetes secrets as deployment-specific mechanisms | M1 | not-started |  |
| SPEC-29.3-003 | 29.3 / 1667 | - redact secret-like values from telemetry | M1 | not-started |  |
| SPEC-29.3-004 | 29.3 / 1668 | - restrict model/tool credentials by environment and capability | M1 | not-started |  |
| SECTION-29.4 | 29.4 / 1670 | 29.4 Evidence integrity | M1 | not-started |  |
| SPEC-29.4-001 | 29.4 / 1672 | Evidence bundles SHOULD be content-addressed and may be signed. Mutations create new versions rather than overwriting finalized records. | M1 | not-started |  |
| SECTION-30 | 30 / 1676 | 30. Privacy and Data Governance | M1 | not-started |  |
| SECTION-30.1 | 30.1 / 1678 | 30.1 Data classes | M1 | not-started |  |
| SPEC-30.1-001 | 30.1 / 1680 | - public metadata | M1 | not-started |  |
| SPEC-30.1-002 | 30.1 / 1681 | - source code | M1 | not-started |  |
| SPEC-30.1-003 | 30.1 / 1682 | - prompts/instructions | M1 | not-started |  |
| SPEC-30.1-004 | 30.1 / 1683 | - model inputs/outputs | M1 | not-started |  |
| SPEC-30.1-005 | 30.1 / 1684 | - tool inputs/outputs | M1 | not-started |  |
| SPEC-30.1-006 | 30.1 / 1685 | - retrieved enterprise data | M1 | not-started |  |
| SPEC-30.1-007 | 30.1 / 1686 | - secrets | M1 | not-started |  |
| SPEC-30.1-008 | 30.1 / 1687 | - PII/sensitive content | M1 | not-started |  |
| SECTION-30.2 | 30.2 / 1689 | 30.2 Controls | M1 | not-started |  |
| SPEC-30.2-001 | 30.2 / 1691 | Support: | M1 | not-started |  |
| SPEC-30.2-002 | 30.2 / 1693 | - field-level capture policy | M1 | not-started |  |
| SPEC-30.2-003 | 30.2 / 1694 | - field-level redaction | M1 | not-started |  |
| SPEC-30.2-004 | 30.2 / 1695 | - tenant retention | M1 | not-started |  |
| SPEC-30.2-005 | 30.2 / 1696 | - regional/self-hosted storage | M1 | not-started |  |
| SPEC-30.2-006 | 30.2 / 1697 | - encryption in transit/at rest | M1 | not-started |  |
| SPEC-30.2-007 | 30.2 / 1698 | - audit access | M1 | not-started |  |
| SPEC-30.2-008 | 30.2 / 1699 | - deletion where legally/operationally permitted | M1 | not-started |  |
| SECTION-30.3 | 30.3 / 1701 | 30.3 Minimal mode | M1 | not-started |  |
| SPEC-30.3-001 | 30.3 / 1703 | AgentCI MUST function in a useful PR-review mode without storing raw production prompts or outputs. | M1 | not-started |  |
| SECTION-31 | 31 / 1707 | 31. API Surface | M0 | not-started |  |
| SECTION-31.1 | 31.1 / 1709 | 31.1 Core REST resources | M0 | not-started |  |
| SPEC-31.1-001 | 31.1 / 1711 | Proposed endpoints: | M0 | not-started |  |
| SECTION-31.2 | 31.2 / 1734 | 31.2 Idempotency | M0 | not-started |  |
| SPEC-31.2-001 | 31.2 / 1736 | Mutation APIs triggered by webhooks MUST support idempotency keys. | M0 | not-started |  |
| SECTION-31.3 | 31.3 / 1738 | 31.3 Event bus | M0 | not-started |  |
| SPEC-31.3-001 | 31.3 / 1740 | Internal events SHOULD use versioned schemas. Example event types: | M0 | not-started |  |
| SPEC-31.3-002 | 31.3 / 1742 | - `pr.analysis.requested` | M0 | not-started |  |
| SPEC-31.3-003 | 31.3 / 1743 | - `pr.analysis.completed` | M0 | not-started |  |
| SPEC-31.3-004 | 31.3 / 1744 | - `eval.run.requested` | M0 | not-started |  |
| SPEC-31.3-005 | 31.3 / 1745 | - `eval.run.completed` | M0 | not-started |  |
| SPEC-31.3-006 | 31.3 / 1746 | - `finding.confirmed` | M0 | not-started |  |
| SPEC-31.3-007 | 31.3 / 1747 | - `release.verified` | M0 | not-started |  |
| SPEC-31.3-008 | 31.3 / 1748 | - `incident.candidate.created` | M0 | not-started |  |
| SPEC-31.3-009 | 31.3 / 1749 | - `incident.reproduced` | M0 | not-started |  |
| SPEC-31.3-010 | 31.3 / 1750 | - `regression.created` | M0 | not-started |  |
| SPEC-31.3-011 | 31.3 / 1751 | - `repair.pr.opened` | M0 | not-started |  |
| SPEC-31.3-012 | 31.3 / 1753 | Implementation may initially use a durable queue; avoid requiring Kafka in V1. | M0 | not-started |  |
| SECTION-32 | 32 / 1757 | 32. CLI | M0 | not-started |  |
| SPEC-32-001 | 32 / 1759 | Binary: `agentci` | M0 | not-started |  |
| SPEC-32-002 | 32 / 1761 | Initial commands: | M0 | not-started |  |
| SPEC-32-003 | 32 / 1777 | The CLI MUST be usable locally and in CI without the SaaS control plane for core validation where possible. | M0 | not-started |  |
| SECTION-33 | 33 / 1781 | 33. UI | M1 | not-started |  |
| SECTION-33.1 | 33.1 / 1783 | 33.1 PR view | M1 | not-started |  |
| SPEC-33.1-001 | 33.1 / 1785 | Show: | M1 | not-started |  |
| SPEC-33.1-002 | 33.1 / 1787 | - intent summary | M1 | not-started |  |
| SPEC-33.1-003 | 33.1 / 1788 | - semantic diff | M1 | not-started |  |
| SPEC-33.1-004 | 33.1 / 1789 | - requirements changed | M1 | not-started |  |
| SPEC-33.1-005 | 33.1 / 1790 | - capabilities/permissions changed | M1 | not-started |  |
| SPEC-33.1-006 | 33.1 / 1791 | - models/tools/policies changed | M1 | not-started |  |
| SPEC-33.1-007 | 33.1 / 1792 | - risk explanation | M1 | not-started |  |
| SPEC-33.1-008 | 33.1 / 1793 | - eval deltas base vs head | M1 | not-started |  |
| SPEC-33.1-009 | 33.1 / 1794 | - confirmed findings | M1 | not-started |  |
| SPEC-33.1-010 | 33.1 / 1795 | - unresolved findings | M1 | not-started |  |
| SPEC-33.1-011 | 33.1 / 1796 | - model disagreement | M1 | not-started |  |
| SPEC-33.1-012 | 33.1 / 1797 | - evidence links | M1 | not-started |  |
| SECTION-33.2 | 33.2 / 1799 | 33.2 Application/Agent view | M1 | not-started |  |
| SPEC-33.2-001 | 33.2 / 1801 | Show: | M1 | not-started |  |
| SPEC-33.2-002 | 33.2 / 1803 | - current release | M1 | not-started |  |
| SPEC-33.2-003 | 33.2 / 1804 | - git SHA | M1 | not-started |  |
| SPEC-33.2-004 | 33.2 / 1805 | - model route | M1 | not-started |  |
| SPEC-33.2-005 | 33.2 / 1806 | - behavioral health | M1 | not-started |  |
| SPEC-33.2-006 | 33.2 / 1807 | - production outcome rate | M1 | not-started |  |
| SPEC-33.2-007 | 33.2 / 1808 | - incidents | M1 | not-started |  |
| SPEC-33.2-008 | 33.2 / 1809 | - recent model/config changes | M1 | not-started |  |
| SECTION-33.3 | 33.3 / 1811 | 33.3 Evidence explorer | M1 | not-started |  |
| SPEC-33.3-001 | 33.3 / 1813 | Navigate requirement -> code -> eval -> trace -> release -> production. | M1 | not-started |  |
| SECTION-33.4 | 33.4 / 1815 | 33.4 Incident view | M1 | not-started |  |
| SPEC-33.4-001 | 33.4 / 1817 | Show timeline: | M1 | not-started |  |
| SPEC-33.4-002 | 33.4 / 1819 | `detection -> trace -> reproduction -> regression -> repair PR -> release -> production verification` | M1 | not-started |  |
| SECTION-34 | 34 / 1823 | 34. Metrics and Product Analytics | M8 | not-started |  |
| SECTION-34.1 | 34.1 / 1825 | 34.1 Engineering quality metrics | M8 | not-started |  |
| SPEC-34.1-001 | 34.1 / 1827 | - behavioral regression rate | M8 | not-started |  |
| SPEC-34.1-002 | 34.1 / 1828 | - escaped regression rate | M8 | not-started |  |
| SPEC-34.1-003 | 34.1 / 1829 | - time to reproduce | M8 | not-started |  |
| SPEC-34.1-004 | 34.1 / 1830 | - time to confirmed root cause | M8 | not-started |  |
| SPEC-34.1-005 | 34.1 / 1831 | - time to repair PR | M8 | not-started |  |
| SPEC-34.1-006 | 34.1 / 1832 | - repeat incident rate | M8 | not-started |  |
| SPEC-34.1-007 | 34.1 / 1833 | - false-positive review rate | M8 | not-started |  |
| SPEC-34.1-008 | 34.1 / 1834 | - human override rate | M8 | not-started |  |
| SECTION-34.2 | 34.2 / 1836 | 34.2 Delivery metrics | M8 | not-started |  |
| SPEC-34.2-001 | 34.2 / 1838 | - PR cycle time | M8 | not-started |  |
| SPEC-34.2-002 | 34.2 / 1839 | - review time saved estimate | M8 | not-started |  |
| SPEC-34.2-003 | 34.2 / 1840 | - eval runtime | M8 | not-started |  |
| SPEC-34.2-004 | 34.2 / 1841 | - cost per verified PR | M8 | not-started |  |
| SPEC-34.2-005 | 34.2 / 1842 | - percent of PRs requiring human deep review | M8 | not-started |  |
| SECTION-34.3 | 34.3 / 1844 | 34.3 Model/router metrics | M8 | not-started |  |
| SPEC-34.3-001 | 34.3 / 1846 | By task/repo/model: | M8 | not-started |  |
| SPEC-34.3-002 | 34.3 / 1848 | - first-pass success | M8 | not-started |  |
| SPEC-34.3-003 | 34.3 / 1849 | - eval pass rate | M8 | not-started |  |
| SPEC-34.3-004 | 34.3 / 1850 | - confirmed finding rate | M8 | not-started |  |
| SPEC-34.3-005 | 34.3 / 1851 | - regression rate | M8 | not-started |  |
| SPEC-34.3-006 | 34.3 / 1852 | - production incident association | M8 | not-started |  |
| SPEC-34.3-007 | 34.3 / 1853 | - latency | M8 | not-started |  |
| SPEC-34.3-008 | 34.3 / 1854 | - cost | M8 | not-started |  |
| SPEC-34.3-009 | 34.3 / 1856 | Do not present these as universal model rankings; they are workload-specific operational measurements. | M8 | not-started |  |
| SECTION-35 | 35 / 1860 | 35. Reliability Requirements | M1 | not-started |  |
| SPEC-35-001 | 35 / 1862 | Initial targets for hosted control plane: | M1 | not-started |  |
| SPEC-35-002 | 35 / 1864 | - API availability: 99.9% target after GA | M1 | not-started |  |
| SPEC-35-003 | 35 / 1865 | - webhook idempotency and replay | M1 | not-started |  |
| SPEC-35-004 | 35 / 1866 | - no loss of finalized evidence on transient worker failure | M1 | not-started |  |
| SPEC-35-005 | 35 / 1867 | - eval jobs resumable/retryable where safe | M1 | not-started |  |
| SPEC-35-006 | 35 / 1868 | - control-plane outage MUST NOT stop existing customer deployment systems unless the customer explicitly configured AgentCI as a required gate | M1 | not-started |  |
| SPEC-35-007 | 35 / 1869 | - fail-open/fail-closed behavior MUST be policy-configurable by gate type | M1 | not-started |  |
| SECTION-36 | 36 / 1873 | 36. Scalability Requirements | M1 | not-started |  |
| SPEC-36-001 | 36 / 1875 | Design assumptions for initial architecture: | M1 | not-started |  |
| SPEC-36-002 | 36 / 1877 | - small org: 10 repos, <100 PRs/day | M1 | not-started |  |
| SPEC-36-003 | 36 / 1878 | - medium: 500 repos, thousands of PRs/day | M1 | not-started |  |
| SPEC-36-004 | 36 / 1879 | - large: thousands of repos, high-volume traces | M1 | not-started |  |
| SPEC-36-005 | 36 / 1881 | Separate high-volume trace storage from relational control metadata. Evidence Graph can retain references to external trace backends. | M1 | not-started |  |
| SECTION-37 | 37 / 1885 | 37. Failure Modes | M1 | not-started |  |
| SPEC-37-001 | 37 / 1887 | The implementation MUST handle: | M1 | not-started |  |
| SPEC-37-002 | 37 / 1889 | - provider unavailable | M1 | not-started |  |
| SPEC-37-003 | 37 / 1890 | - provider rate limit | M1 | not-started |  |
| SPEC-37-004 | 37 / 1891 | - reviewer model timeout | M1 | not-started |  |
| SPEC-37-005 | 37 / 1892 | - eval flaky/non-deterministic | M1 | not-started |  |
| SPEC-37-006 | 37 / 1893 | - CI run cancelled | M1 | not-started |  |
| SPEC-37-007 | 37 / 1894 | - PR force-push during evaluation | M1 | not-started |  |
| SPEC-37-008 | 37 / 1895 | - base branch changes | M1 | not-started |  |
| SPEC-37-009 | 37 / 1896 | - untrusted fork PR | M1 | not-started |  |
| SPEC-37-010 | 37 / 1897 | - missing spec | M1 | not-started |  |
| SPEC-37-011 | 37 / 1898 | - malformed policy | M1 | not-started |  |
| SPEC-37-012 | 37 / 1899 | - unsupported model feature | M1 | not-started |  |
| SPEC-37-013 | 37 / 1900 | - MCP server unavailable | M1 | not-started |  |
| SPEC-37-014 | 37 / 1901 | - trace backend unavailable | M1 | not-started |  |
| SPEC-37-015 | 37 / 1902 | - incomplete evidence | M1 | not-started |  |
| SPEC-37-016 | 37 / 1903 | - replay impossible due to missing fixtures | M1 | not-started |  |
| SPEC-37-017 | 37 / 1904 | - production signal ambiguous | M1 | not-started |  |
| SPEC-37-018 | 37 / 1906 | Every result must distinguish: | M1 | not-started |  |
| SPEC-37-019 | 37 / 1908 | - failed verification | M1 | not-started |  |
| SPEC-37-020 | 37 / 1909 | - verification infrastructure failure | M1 | not-started |  |
| SPEC-37-021 | 37 / 1910 | - skipped/not applicable | M1 | not-started |  |
| SPEC-37-022 | 37 / 1911 | - inconclusive | M1 | not-started |  |
| SPEC-37-023 | 37 / 1913 | Never report infrastructure failure as behavioral success. | M1 | not-started |  |
| SECTION-38 | 38 / 1917 | 38. Versioning | M0 | not-started |  |
| SPEC-38-001 | 38 / 1919 | Version independently: | M0 | not-started |  |
| SPEC-38-002 | 38 / 1921 | - AgentCI project schema | M0 | not-started |  |
| SPEC-38-003 | 38 / 1922 | - evidence schema | M0 | not-started |  |
| SPEC-38-004 | 38 / 1923 | - trace semantic mapping | M0 | not-started |  |
| SPEC-38-005 | 38 / 1924 | - CRDs | M0 | not-started |  |
| SPEC-38-006 | 38 / 1925 | - CLI | M0 | not-started |  |
| SPEC-38-007 | 38 / 1926 | - SDKs | M0 | not-started |  |
| SPEC-38-008 | 38 / 1927 | - provider adapters | M0 | not-started |  |
| SPEC-38-009 | 38 / 1928 | - policy bundles | M0 | not-started |  |
| SPEC-38-010 | 38 / 1930 | Backward compatibility strategy is required before beta. | M0 | not-started |  |
| SECTION-39 | 39 / 1934 | 39. Dogfooding Strategy | M1 | not-started |  |
| SPEC-39-001 | 39 / 1936 | Yes: AgentCI SHOULD be dogfooded as early as possible, and the dogfood loop is itself a product requirement. | M1 | not-started |  |
| SECTION-39.1 | 39.1 / 1938 | 39.1 Bootstrap paradox | M1 | not-started |  |
| SPEC-39.1-001 | 39.1 / 1940 | V0 cannot depend on AgentCI before AgentCI exists. Bootstrap in stages. | M1 | not-started |  |
| SPEC-39.1-002 | 39.1 / 1944 | Use this document as the source spec. The coding agent builds the initial repo using normal Git/PR/CI. | M1 | not-started |  |
| SPEC-39.1-003 | 39.1 / 1946 | Required initial repo artifacts: | M1 | not-started |  |
| SPEC-39.1-004 | 39.1 / 1957 | As soon as `agentci diff`, `agentci risk`, and `agentci eval` exist: | M1 | not-started |  |
| SPEC-39.1-005 | 39.1 / 1959 | - every AgentCI PR runs AgentCI locally/in CI | M1 | not-started |  |
| SPEC-39.1-006 | 39.1 / 1960 | - outputs are stored as build artifacts | M1 | not-started |  |
| SPEC-39.1-007 | 39.1 / 1961 | - failures do not block merge initially | M1 | not-started |  |
| SPEC-39.1-008 | 39.1 / 1965 | Install the AgentCI GitHub App on the AgentCI repository. | M1 | not-started |  |
| SPEC-39.1-009 | 39.1 / 1967 | Every AgentCI PR receives its own semantic review. | M1 | not-started |  |
| SPEC-39.1-010 | 39.1 / 1969 | This creates the first recursive proof: | M1 | not-started |  |
| SPEC-39.1-011 | 39.1 / 1971 | `AgentCI reviews AgentCI.` | M1 | not-started |  |
| SPEC-39.1-012 | 39.1 / 1973 | Initially checks are advisory. | M1 | not-started |  |
| SPEC-39.1-013 | 39.1 / 1977 | After measured false-positive rate and stability reach agreed thresholds, make `agentci/review` required on the AgentCI repo. | M1 | not-started |  |
| SPEC-39.1-014 | 39.1 / 1979 | Recommended gate to reach D3: | M1 | not-started |  |
| SPEC-39.1-015 | 39.1 / 1981 | - >= 100 dogfood PRs or equivalent test corpus | M1 | not-started |  |
| SPEC-39.1-016 | 39.1 / 1982 | - check infrastructure success >= 99% | M1 | not-started |  |
| SPEC-39.1-017 | 39.1 / 1983 | - no known critical false-negative class in deterministic permission/risk detection | M1 | not-started |  |
| SPEC-39.1-018 | 39.1 / 1984 | - high-severity false-positive rate acceptable to team | M1 | not-started |  |
| SPEC-39.1-019 | 39.1 / 1988 | Instrument AgentCI's own control-plane services with the AgentCI SDK and OTLP. | M1 | not-started |  |
| SPEC-39.1-020 | 39.1 / 1990 | Correlate: | M1 | not-started |  |
| SPEC-39.1-021 | 39.1 / 1992 | - model review calls | M1 | not-started |  |
| SPEC-39.1-022 | 39.1 / 1993 | - eval runner calls | M1 | not-started |  |
| SPEC-39.1-023 | 39.1 / 1994 | - tool calls | M1 | not-started |  |
| SPEC-39.1-024 | 39.1 / 1995 | - GitHub API calls | M1 | not-started |  |
| SPEC-39.1-025 | 39.1 / 1996 | - repair workflows | M1 | not-started |  |
| SPEC-39.1-026 | 39.1 / 2000 | Feed AgentCI's own application errors and user-reported failures into Incident Correlator. | M1 | not-started |  |
| SPEC-39.1-027 | 39.1 / 2002 | Every confirmed internal defect SHOULD become a regression when reproducible. | M1 | not-started |  |
| SPEC-39.1-028 | 39.1 / 2006 | Allow AgentCI to automatically: | M1 | not-started |  |
| SPEC-39.1-029 | 39.1 / 2008 | - diagnose its own incidents | M1 | not-started |  |
| SPEC-39.1-030 | 39.1 / 2009 | - generate regression drafts | M1 | not-started |  |
| SPEC-39.1-031 | 39.1 / 2010 | - generate candidate fixes | M1 | not-started |  |
| SPEC-39.1-032 | 39.1 / 2011 | - create branches | M1 | not-started |  |
| SPEC-39.1-033 | 39.1 / 2012 | - open PRs | M1 | not-started |  |
| SPEC-39.1-034 | 39.1 / 2014 | Keep merge/deploy human-governed initially. | M1 | not-started |  |
| SPEC-39.1-035 | 39.1 / 2018 | Permit narrowly scoped auto-merge for low-risk classes only after a formal autonomy policy and rollback mechanism are demonstrated. | M1 | not-started |  |
| SECTION-39.2 | 39.2 / 2020 | 39.2 Dogfood dashboard | M1 | not-started |  |
| SPEC-39.2-001 | 39.2 / 2022 | Track: | M1 | not-started |  |
| SPEC-39.2-002 | 39.2 / 2024 | - AgentCI PRs reviewed by AgentCI | M1 | not-started |  |
| SPEC-39.2-003 | 39.2 / 2025 | - findings generated | M1 | not-started |  |
| SPEC-39.2-004 | 39.2 / 2026 | - findings confirmed | M1 | not-started |  |
| SPEC-39.2-005 | 39.2 / 2027 | - false positives | M1 | not-started |  |
| SPEC-39.2-006 | 39.2 / 2028 | - regressions prevented | M1 | not-started |  |
| SPEC-39.2-007 | 39.2 / 2029 | - incidents converted to regressions | M1 | not-started |  |
| SPEC-39.2-008 | 39.2 / 2030 | - auto-generated PRs | M1 | not-started |  |
| SPEC-39.2-009 | 39.2 / 2031 | - accepted/rejected auto-fixes | M1 | not-started |  |
| SPEC-39.2-010 | 39.2 / 2032 | - time saved | M1 | not-started |  |
| SECTION-39.3 | 39.3 / 2034 | 39.3 Dogfood-specific safety | M1 | not-started |  |
| SPEC-39.3-001 | 39.3 / 2036 | Never allow a reviewer agent to modify the evidence used to judge its own PR without independent validation. Separate reviewer credentials from coding-agent credentials. | M1 | not-started |  |
| SECTION-40 | 40 / 2040 | 40. Build Plan | M0 | not-started |  |
| SPEC-40-001 | 40 / 2044 | Build: | M0 | not-started |  |
| SPEC-40-002 | 40 / 2046 | - monorepo/repo structure | M0 | in-progress | package.json, apps/api/server.ts |
| SPEC-40-003 | 40 / 2047 | - `agentci.yaml` JSON Schema | M0 | in-progress | packages/schemas/json/agent-project.schema.json |
| SPEC-40-004 | 40 / 2048 | - requirement schema | M0 | in-progress | packages/schemas/json/requirement.schema.json |
| SPEC-40-005 | 40 / 2049 | - finding schema | M0 | in-progress | packages/schemas/json/finding.schema.json |
| SPEC-40-006 | 40 / 2050 | - evidence schema | M0 | in-progress | packages/schemas/json/evidence.schema.json |
| SPEC-40-007 | 40 / 2051 | - trace mapping spec | M0 | in-progress | docs/trace-mapping.md |
| SPEC-40-008 | 40 / 2052 | - CLI skeleton | M0 | in-progress | cmd/agentci/main.ts |
| SPEC-40-009 | 40 / 2053 | - basic API skeleton | M0 | in-progress | apps/api/server.ts |
| SPEC-40-010 | 40 / 2055 | Exit criteria: | M0 | not-started |  |
| SPEC-40-011 | 40 / 2057 | - `agentci validate` validates this repository | M0 | in-progress | tests/project.test.ts |
| SPEC-40-012 | 40 / 2058 | - schemas have tests | M0 | in-progress | tests/schemas.test.ts |
| SPEC-40-013 | 40 / 2062 | Build: | M1 | tested | docs/m1-setup.md, docs/releases/m1.md |
| SPEC-40-014 | 40 / 2064 | - GitHub App | M1 | tested | packages/github/client.ts, docs/m1-setup.md, docs/dogfood/m1-first-check.md, docs/releases/m1.md |
| SPEC-40-015 | 40 / 2065 | - webhook ingestion | M1 | tested | apps/control/server.ts, tests/control-api.test.ts, tests/integration/m1.test.ts, docs/releases/m1.md |
| SPEC-40-016 | 40 / 2066 | - base/head checkout/resolution | M1 | tested | packages/review/git.ts, packages/github/client.ts, tests/review.test.ts, docs/releases/m1.md |
| SPEC-40-017 | 40 / 2067 | - semantic diff v1 | M1 | tested | packages/review/engine.ts, tests/review.test.ts, evals/m1-semantic.yaml, docs/releases/m1.md |
| SPEC-40-018 | 40 / 2068 | - deterministic risk rules | M1 | tested | packages/review/engine.ts, tests/review.test.ts, evals/m1-semantic.yaml, docs/releases/m1.md |
| SPEC-40-019 | 40 / 2069 | - GitHub Check publishing | M1 | tested | packages/github/client.ts, apps/worker/activities.ts, docs/dogfood/m1-first-check.md, docs/releases/m1.md |
| SPEC-40-020 | 40 / 2070 | - evidence records | M1 | tested | packages/storage/postgres.ts, tests/integration/m1.test.ts, docs/dogfood/m1-first-check.md, docs/releases/m1.md |
| SPEC-40-021 | 40 / 2072 | V1 semantic diff MUST detect: | M1 | tested | packages/review/engine.ts, evals/m1-semantic.yaml, docs/releases/m1.md |
| SPEC-40-022 | 40 / 2074 | - spec changes | M1 | tested | packages/review/engine.ts, tests/review.test.ts, evals/m1-semantic.yaml, docs/releases/m1.md |
| SPEC-40-023 | 40 / 2075 | - model/config changes | M1 | tested | packages/review/engine.ts, tests/review.test.ts, evals/m1-semantic.yaml, docs/releases/m1.md |
| SPEC-40-024 | 40 / 2076 | - tool definitions where explicit | M1 | tested | packages/review/engine.ts, tests/review.test.ts, evals/m1-semantic.yaml, docs/releases/m1.md |
| SPEC-40-025 | 40 / 2077 | - permission/policy file changes where configured | M1 | tested | packages/review/engine.ts, tests/review.test.ts, evals/m1-semantic.yaml, docs/releases/m1.md |
| SPEC-40-026 | 40 / 2078 | - prompt changes | M1 | tested | packages/review/engine.ts, tests/review.test.ts, evals/m1-semantic.yaml, docs/releases/m1.md |
| SPEC-40-027 | 40 / 2079 | - dependency changes | M1 | tested | packages/review/engine.ts, tests/review.test.ts, evals/m1-semantic.yaml, docs/releases/m1.md |
| SPEC-40-028 | 40 / 2081 | Exit criteria: | M1 | tested | docs/releases/m1.md |
| SPEC-40-029 | 40 / 2083 | - AgentCI repository uses advisory AgentCI check on every PR | M1 | tested | docs/dogfood/m1-first-check.md, docs/releases/m1.md |
| SPEC-40-030 | 40 / 2087 | Build: | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-40-031 | 40 / 2089 | - eval manifest | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-40-032 | 40 / 2090 | - native command runner | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-40-033 | 40 / 2091 | - pytest adapter | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-40-034 | 40 / 2092 | - Promptfoo/DeepEval adapter as optional plugins | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-40-035 | 40 / 2093 | - result normalization | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-40-036 | 40 / 2094 | - statistical trial handling | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-40-037 | 40 / 2095 | - base/head comparison | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-40-038 | 40 / 2097 | Exit criteria: | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-40-039 | 40 / 2099 | - PR shows behavioral deltas and regression scenarios | M2 | tested | releases/m2-final-acceptance-audit.json |
| SPEC-40-040 | 40 / 2103 | Build: | M3 | not-started |  |
| SPEC-40-041 | 40 / 2105 | - provider abstraction | M3 | not-started |  |
| SPEC-40-042 | 40 / 2106 | - OpenAI adapter | M3 | not-started |  |
| SPEC-40-043 | 40 / 2107 | - Anthropic adapter | M3 | not-started |  |
| SPEC-40-044 | 40 / 2108 | - xAI adapter | M3 | not-started |  |
| SPEC-40-045 | 40 / 2109 | - reviewer role templates | M3 | not-started |  |
| SPEC-40-046 | 40 / 2110 | - finding normalization | M3 | not-started |  |
| SPEC-40-047 | 40 / 2111 | - dedupe | M3 | not-started |  |
| SPEC-40-048 | 40 / 2112 | - reproduction hooks | M3 | not-started |  |
| SPEC-40-049 | 40 / 2114 | Exit criteria: | M3 | not-started |  |
| SPEC-40-050 | 40 / 2116 | - coding model can be reviewed by a different provider | M3 | not-started |  |
| SPEC-40-051 | 40 / 2117 | - unsupported claims remain explicitly unconfirmed | M3 | not-started |  |
| SPEC-40-052 | 40 / 2121 | Build: | M4 | not-started |  |
| SPEC-40-053 | 40 / 2123 | - Python SDK | M4 | not-started |  |
| SPEC-40-054 | 40 / 2124 | - JS/TS SDK | M4 | not-started |  |
| SPEC-40-055 | 40 / 2125 | - OTLP export | M4 | not-started |  |
| SPEC-40-056 | 40 / 2126 | - AgentCI semantic attributes | M4 | not-started |  |
| SPEC-40-057 | 40 / 2127 | - trace explorer linkage | M4 | not-started |  |
| SPEC-40-058 | 40 / 2129 | Exit criteria: | M4 | not-started |  |
| SPEC-40-059 | 40 / 2131 | - AgentCI control plane traces its own model/tool operations | M4 | not-started |  |
| SPEC-40-060 | 40 / 2135 | Build: | M5 | not-started |  |
| SPEC-40-061 | 40 / 2137 | - MCP client/server proxy capability | M5 | not-started |  |
| SPEC-40-062 | 40 / 2138 | - tool discovery forwarding | M5 | not-started |  |
| SPEC-40-063 | 40 / 2139 | - auth passthrough/integration | M5 | not-started |  |
| SPEC-40-064 | 40 / 2140 | - tracing | M5 | not-started |  |
| SPEC-40-065 | 40 / 2141 | - policy hooks | M5 | not-started |  |
| SPEC-40-066 | 40 / 2142 | - redaction | M5 | not-started |  |
| SPEC-40-067 | 40 / 2144 | Exit criteria: | M5 | not-started |  |
| SPEC-40-068 | 40 / 2146 | - tool invocations are visible and enforceable through gateway | M5 | not-started |  |
| SPEC-40-069 | 40 / 2150 | Build: | M6 | not-started |  |
| SPEC-40-070 | 40 / 2152 | - AgentRelease schema | M6 | not-started |  |
| SPEC-40-071 | 40 / 2153 | - evidence bundle generation | M6 | not-started |  |
| SPEC-40-072 | 40 / 2154 | - signed/content-addressed evidence | M6 | not-started |  |
| SPEC-40-073 | 40 / 2155 | - CI integration | M6 | not-started |  |
| SPEC-40-074 | 40 / 2157 | Exit criteria: | M6 | not-started |  |
| SPEC-40-075 | 40 / 2159 | - any verified release can be reconstructed to exact source/spec/evals/model policy | M6 | not-started |  |
| SPEC-40-076 | 40 / 2163 | Build: | M7 | not-started |  |
| SPEC-40-077 | 40 / 2165 | - Tekton Tasks | M7 | not-started |  |
| SPEC-40-078 | 40 / 2166 | - Pipelines as Code templates | M7 | not-started |  |
| SPEC-40-079 | 40 / 2167 | - Tekton Results links | M7 | not-started |  |
| SPEC-40-080 | 40 / 2168 | - Tekton Chains evidence integration | M7 | not-started |  |
| SPEC-40-081 | 40 / 2169 | - OpenShift Operator/CRDs | M7 | not-started |  |
| SPEC-40-082 | 40 / 2171 | Exit criteria: | M7 | not-started |  |
| SPEC-40-083 | 40 / 2173 | - a sample OpenShift repo completes PR -> Tekton eval -> signed AgentRelease evidence | M7 | not-started |  |
| SPEC-40-084 | 40 / 2177 | Build: | M8 | not-started |  |
| SPEC-40-085 | 40 / 2179 | - outcomes API | M8 | not-started |  |
| SPEC-40-086 | 40 / 2180 | - incident candidate engine | M8 | not-started |  |
| SPEC-40-087 | 40 / 2181 | - external alert adapters | M8 | not-started |  |
| SPEC-40-088 | 40 / 2182 | - correlation | M8 | not-started |  |
| SPEC-40-089 | 40 / 2183 | - incident UI | M8 | not-started |  |
| SPEC-40-090 | 40 / 2185 | Exit criteria: | M8 | not-started |  |
| SPEC-40-091 | 40 / 2187 | - a seeded production-like failure creates a correctly linked incident | M8 | not-started |  |
| SPEC-40-092 | 40 / 2191 | Build: | M9 | not-started |  |
| SPEC-40-093 | 40 / 2193 | - replay packages | M9 | not-started |  |
| SPEC-40-094 | 40 / 2194 | - recorded replay | M9 | not-started |  |
| SPEC-40-095 | 40 / 2195 | - ephemeral replay extension | M9 | not-started |  |
| SPEC-40-096 | 40 / 2196 | - regression generation | M9 | not-started |  |
| SPEC-40-097 | 40 / 2198 | Exit criteria: | M9 | not-started |  |
| SPEC-40-098 | 40 / 2200 | - seeded incident is reproducible and becomes a permanent regression | M9 | not-started |  |
| SPEC-40-099 | 40 / 2204 | Build: | M10 | not-started |  |
| SPEC-40-100 | 40 / 2206 | - root-cause workflow | M10 | not-started |  |
| SPEC-40-101 | 40 / 2207 | - candidate patch workflow | M10 | not-started |  |
| SPEC-40-102 | 40 / 2208 | - branch/PR automation | M10 | not-started |  |
| SPEC-40-103 | 40 / 2209 | - autonomy policy | M10 | not-started |  |
| SPEC-40-104 | 40 / 2211 | Exit criteria: | M10 | not-started |  |
| SPEC-40-105 | 40 / 2213 | - seeded incident creates a verified repair PR without human code authoring | M10 | not-started |  |
| SECTION-41 | 41 / 2217 | 41. Recommended Implementation Stack | M0 | not-started |  |
| SPEC-41-001 | 41 / 2219 | This is a recommendation, not a hard requirement. | M0 | not-started |  |
| SPEC-41-002 | 41 / 2223 | - TypeScript or Go for APIs/controllers; pick one primary language to reduce complexity | M0 | not-started |  |
| SPEC-41-003 | 41 / 2224 | - PostgreSQL for metadata/evidence graph V1 | M0 | not-started |  |
| SPEC-41-004 | 41 / 2225 | - object storage for large evidence/replay artifacts | M0 | not-started |  |
| SPEC-41-005 | 41 / 2226 | - durable job queue | M0 | not-started |  |
| SPEC-41-006 | 41 / 2227 | - OpenTelemetry throughout | M0 | not-started |  |
| SPEC-41-007 | 41 / 2231 | - Go is attractive for single binary distribution, or TypeScript if team velocity favors shared libraries | M0 | not-started |  |
| SPEC-41-008 | 41 / 2235 | - Python | M0 | not-started |  |
| SPEC-41-009 | 41 / 2236 | - TypeScript | M0 | not-started |  |
| SPEC-41-010 | 41 / 2240 | - Go/controller-runtime/operator-sdk style implementation | M0 | not-started |  |
| SPEC-41-011 | 41 / 2244 | - React/TypeScript | M0 | not-started |  |
| SPEC-41-012 | 41 / 2248 | - internal structured rules initially; optional OPA integration for enterprise | M0 | not-started |  |
| SECTION-42 | 42 / 2252 | 42. Suggested Monorepo Structure | M0 | not-started |  |
| SECTION-43 | 43 / 2292 | 43. Initial Database Model | M1 | not-started |  |
| SPEC-43-001 | 43 / 2294 | Suggested tables: | M1 | not-started |  |
| SPEC-43-002 | 43 / 2328 | Use immutable `created_at`; version mutable logical objects. | M1 | not-started |  |
| SECTION-44 | 44 / 2332 | 44. Acceptance Criteria by Product Area | M1 | not-started |  |
| SPEC-44-001 | 44 / 2336 | - handles PR open/update/rebase safely | M1 | not-started |  |
| SPEC-44-002 | 44 / 2337 | - analyzes latest head SHA only | M1 | not-started |  |
| SPEC-44-003 | 44 / 2338 | - stale runs cannot satisfy current PR gate | M1 | not-started |  |
| SPEC-44-004 | 44 / 2339 | - annotations link to concrete evidence | M1 | not-started |  |
| SPEC-44-005 | 44 / 2340 | - deterministic high-risk changes are detected without an LLM | M1 | not-started |  |
| SPEC-44-006 | 44 / 2344 | - repeatable suite selection | M1 | not-started |  |
| SPEC-44-007 | 44 / 2345 | - base/head support | M1 | not-started |  |
| SPEC-44-008 | 44 / 2346 | - trials and thresholds | M1 | not-started |  |
| SPEC-44-009 | 44 / 2347 | - critical failure handling | M1 | not-started |  |
| SPEC-44-010 | 44 / 2348 | - infra failure != pass | M1 | not-started |  |
| SPEC-44-011 | 44 / 2352 | - no core schema embeds provider-specific response object | M1 | not-started |  |
| SPEC-44-012 | 44 / 2353 | - at least three providers supported through adapters | M1 | not-started |  |
| SPEC-44-013 | 44 / 2354 | - provider-specific capabilities accessible through extensions | M1 | not-started |  |
| SPEC-44-014 | 44 / 2358 | - model and tool spans link to PR/release where context exists | M1 | not-started |  |
| SPEC-44-015 | 44 / 2359 | - raw content capture disabled by default in metadata-only mode | M1 | not-started |  |
| SPEC-44-016 | 44 / 2360 | - customer can export OTLP to their backend | M1 | not-started |  |
| SPEC-44-017 | 44 / 2364 | - every check result can be traced to input commit and produced artifacts | M1 | not-started |  |
| SPEC-44-018 | 44 / 2365 | - finalized release evidence is immutable/content-addressed | M1 | not-started |  |
| SPEC-44-019 | 44 / 2369 | - Tekton Task catalog installs cleanly | M1 | not-started |  |
| SPEC-44-020 | 44 / 2370 | - sample PaC pipeline works from PR event | M1 | not-started |  |
| SPEC-44-021 | 44 / 2371 | - AgentRelease CR reflects verification status | M1 | not-started |  |
| SPEC-44-022 | 44 / 2372 | - existing Argo/OpenShift GitOps flow remains authoritative for deployment | M1 | not-started |  |
| SPEC-44-023 | 44 / 2376 | - known incident can be correlated | M1 | not-started |  |
| SPEC-44-024 | 44 / 2377 | - reproducible incident can generate regression | M1 | not-started |  |
| SPEC-44-025 | 44 / 2378 | - regression runs on subsequent PRs | M1 | not-started |  |
| SPEC-44-026 | 44 / 2379 | - repair PR includes incident and regression lineage | M1 | not-started |  |
| SECTION-45 | 45 / 2383 | 45. Test Strategy for AgentCI Itself | M0 | not-started |  |
| SPEC-45-001 | 45 / 2387 | - schema parsing | M0 | not-started |  |
| SPEC-45-002 | 45 / 2388 | - policy/risk rules | M0 | not-started |  |
| SPEC-45-003 | 45 / 2389 | - diff parsing | M0 | not-started |  |
| SPEC-45-004 | 45 / 2390 | - GitHub webhook idempotency | M0 | not-started |  |
| SPEC-45-005 | 45 / 2391 | - auth/RBAC | M0 | not-started |  |
| SPEC-45-006 | 45 / 2392 | - provider adapter normalization | M0 | not-started |  |
| SPEC-45-007 | 45 / 2393 | - evidence graph relationships | M0 | not-started |  |
| SPEC-45-008 | 45 / 2397 | Use synthetic PR corpora with known expected semantic changes. | M0 | not-started |  |
| SPEC-45-009 | 45 / 2399 | Examples: | M0 | not-started |  |
| SPEC-45-010 | 45 / 2401 | - harmless documentation change | M0 | not-started |  |
| SPEC-45-011 | 45 / 2402 | - prompt change that broadens permissions | M0 | not-started |  |
| SPEC-45-012 | 45 / 2403 | - MCP tool addition | M0 | not-started |  |
| SPEC-45-013 | 45 / 2404 | - policy weakening hidden in refactor | M0 | not-started |  |
| SPEC-45-014 | 45 / 2405 | - model change with behavior regression | M0 | not-started |  |
| SPEC-45-015 | 45 / 2406 | - test deletion intended to hide failure | M0 | not-started |  |
| SPEC-45-016 | 45 / 2407 | - malicious PR text attempting prompt injection against reviewer | M0 | not-started |  |
| SPEC-45-017 | 45 / 2411 | - PR description instructs reviewer to ignore policy | M0 | not-started |  |
| SPEC-45-018 | 45 / 2412 | - source comments contain fake system instructions | M0 | not-started |  |
| SPEC-45-019 | 45 / 2413 | - malicious MCP descriptions | M0 | not-started |  |
| SPEC-45-020 | 45 / 2414 | - obfuscated permission broadening | M0 | not-started |  |
| SPEC-45-021 | 45 / 2415 | - generated tests that trivially pass | M0 | not-started |  |
| SPEC-45-022 | 45 / 2416 | - evidence tampering attempt | M0 | not-started |  |
| SPEC-45-023 | 45 / 2420 | Every important real AgentCI bug SHOULD become a regression fixture. | M0 | not-started |  |
| SECTION-46 | 46 / 2424 | 46. Open Questions / Areas Requiring More Design | M1 | not-started |  |
| SPEC-46-001 | 46 / 2426 | These MUST be tracked as design work, not hand-waved. | M1 | not-started |  |
| SECTION-46.1 | 46.1 / 2428 | 46.1 Behavioral diff correctness | M1 | not-started |  |
| SPEC-46.1-001 | 46.1 / 2430 | How do we minimize false certainty when behavior is probabilistic? Need a formal representation of: | M1 | not-started |  |
| SPEC-46.1-002 | 46.1 / 2432 | - observed change | M1 | not-started |  |
| SPEC-46.1-003 | 46.1 / 2433 | - inferred change | M1 | not-started |  |
| SPEC-46.1-004 | 46.1 / 2434 | - statistically significant change | M1 | not-started |  |
| SPEC-46.1-005 | 46.1 / 2435 | - unknown due to insufficient trials | M1 | not-started |  |
| SECTION-46.2 | 46.2 / 2437 | 46.2 Eval coverage | M1 | not-started |  |
| SPEC-46.2-001 | 46.2 / 2439 | Traditional code coverage does not map directly to behavioral space. Need a coverage model across: | M1 | not-started |  |
| SPEC-46.2-002 | 46.2 / 2441 | - requirements | M1 | not-started |  |
| SPEC-46.2-003 | 46.2 / 2442 | - capabilities | M1 | not-started |  |
| SPEC-46.2-004 | 46.2 / 2443 | - permissions | M1 | not-started |  |
| SPEC-46.2-005 | 46.2 / 2444 | - tools | M1 | not-started |  |
| SPEC-46.2-006 | 46.2 / 2445 | - scenarios | M1 | not-started |  |
| SPEC-46.2-007 | 46.2 / 2446 | - production incidents | M1 | not-started |  |
| SECTION-46.3 | 46.3 / 2448 | 46.3 Replay fidelity | M1 | not-started |  |
| SPEC-46.3-001 | 46.3 / 2450 | Need explicit policies for what is captured, mocked, snapshotted, or re-created, especially for mutable external systems and changing hosted models. | M1 | not-started |  |
| SECTION-46.4 | 46.4 / 2452 | 46.4 Provider drift | M1 | not-started |  |
| SPEC-46.4-001 | 46.4 / 2454 | Hosted model identifiers may change behavior over time. Need to record provider-returned model/version metadata and allow periodic baseline revalidation. | M1 | not-started |  |
| SECTION-46.5 | 46.5 / 2456 | 46.5 Causality vs correlation | M1 | not-started |  |
| SPEC-46.5-001 | 46.5 / 2458 | Production timing correlation is insufficient to prove causality. Need confidence labels and human override. | M1 | not-started |  |
| SECTION-46.6 | 46.6 / 2460 | 46.6 Tool side-effect classification | M1 | not-started |  |
| SPEC-46.6-001 | 46.6 / 2462 | MCP/tool metadata may be incomplete/untrusted. Need organization-managed classifications and deterministic enforcement. | M1 | not-started |  |
| SECTION-46.7 | 46.7 / 2464 | 46.7 Spec ambiguity | M1 | not-started |  |
| SPEC-46.7-001 | 46.7 / 2466 | The product cannot promise complete formal verification of natural language. Need UX that clearly distinguishes explicit requirements from inferred interpretations. | M1 | not-started |  |
| SECTION-46.8 | 46.8 / 2468 | 46.8 Cost control | M1 | not-started |  |
| SPEC-46.8-001 | 46.8 / 2470 | Multi-model review and repeated trials can become expensive. Need targeted eval selection, caching, budgets, and adaptive depth. | M1 | not-started |  |
| SECTION-46.9 | 46.9 / 2472 | 46.9 PR trust boundaries | M1 | not-started |  |
| SPEC-46.9-001 | 46.9 / 2474 | Untrusted fork PR content can attack reviewer models. Need strong separation between untrusted repository content and system instructions; never expose privileged tools to analysis of untrusted code by default. | M1 | not-started |  |
| SECTION-46.10 | 46.10 / 2476 | 46.10 Self-modification / dogfood conflict | M1 | not-started |  |
| SPEC-46.10-001 | 46.10 / 2478 | When AgentCI proposes a change to its own reviewer/risk engine, independent checks must judge that change. Define protected bootstrap rules so the component under modification cannot unilaterally weaken the gate judging itself. | M1 | not-started |  |
| SECTION-47 | 47 / 2482 | 47. MVP Cut Line | M1 | not-started |  |
| SPEC-47-001 | 47 / 2484 | The minimum product worth putting in front of real engineering teams is: | M1 | not-started |  |
| SPEC-47-002 | 47 / 2486 | 1. GitHub App | M1 | not-started |  |
| SPEC-47-003 | 47 / 2487 | 2. `agentci.yaml` | M1 | not-started |  |
| SPEC-47-004 | 47 / 2488 | 3. requirement/spec parser | M1 | not-started |  |
| SPEC-47-005 | 47 / 2489 | 4. semantic diff v1 | M1 | not-started |  |
| SPEC-47-006 | 47 / 2490 | 5. deterministic risk engine | M1 | not-started |  |
| SPEC-47-007 | 47 / 2491 | 6. eval runner/orchestrator | M1 | not-started |  |
| SPEC-47-008 | 47 / 2492 | 7. OpenAI + Anthropic + xAI reviewer adapters | M1 | not-started |  |
| SPEC-47-009 | 47 / 2493 | 8. finding normalization/deduplication | M1 | not-started |  |
| SPEC-47-010 | 47 / 2494 | 9. evidence store | M1 | not-started |  |
| SPEC-47-011 | 47 / 2495 | 10. GitHub Check UI | M1 | not-started |  |
| SPEC-47-012 | 47 / 2496 | 11. CLI | M1 | not-started |  |
| SPEC-47-013 | 47 / 2497 | 12. self-dogfood on AgentCI repository | M1 | not-started |  |
| SPEC-47-014 | 47 / 2499 | Not required to prove V1 value: | M1 | not-started |  |
| SPEC-47-015 | 47 / 2501 | - Kubernetes operator | M1 | not-started |  |
| SPEC-47-016 | 47 / 2502 | - MCP gateway | M1 | not-started |  |
| SPEC-47-017 | 47 / 2503 | - production incident correlation | M1 | not-started |  |
| SPEC-47-018 | 47 / 2504 | - auto-repair | M1 | not-started |  |
| SPEC-47-019 | 47 / 2505 | - model router | M1 | not-started |  |
| SPEC-47-020 | 47 / 2506 | - Argo integration | M1 | not-started |  |
| SPEC-47-021 | 47 / 2508 | Those are expansion layers. | M1 | not-started |  |
| SECTION-48 | 48 / 2512 | 48. MVP Demo Scenario | M1 | not-started |  |
| SPEC-48-001 | 48 / 2514 | A strong end-to-end demo: | M1 | not-started |  |
| SPEC-48-002 | 48 / 2516 | 1. Base repo contains an SRE agent with `restart_cluster` limited to development. | M1 | not-started |  |
| SPEC-48-003 | 48 / 2517 | 2. PR changes spec/code/tool policy to allow production restart. | M1 | not-started |  |
| SPEC-48-004 | 48 / 2518 | 3. Coding agent generated 1,500+ lines. | M1 | not-started |  |
| SPEC-48-005 | 48 / 2519 | 4. AgentCI reports: | M1 | not-started |  |
| SPEC-48-006 | 48 / 2520 | - new production capability | M1 | not-started |  |
| SPEC-48-007 | 48 / 2521 | - expanded permission | M1 | not-started |  |
| SPEC-48-008 | 48 / 2522 | - changed requirement | M1 | not-started |  |
| SPEC-48-009 | 48 / 2523 | - high risk | M1 | not-started |  |
| SPEC-48-010 | 48 / 2524 | 5. Eval runs base/head. | M1 | not-started |  |
| SPEC-48-011 | 48 / 2525 | 6. One scenario shows approval bypass. | M1 | not-started |  |
| SPEC-48-012 | 48 / 2526 | 7. Independent reviewer proposes a reproducer. | M1 | not-started |  |
| SPEC-48-013 | 48 / 2527 | 8. Reproducer confirms issue. | M1 | not-started |  |
| SPEC-48-014 | 48 / 2528 | 9. GitHub Check blocks PR with concise evidence. | M1 | not-started |  |
| SPEC-48-015 | 48 / 2529 | 10. Click `Propose fix`. | M1 | not-started |  |
| SPEC-48-016 | 48 / 2530 | 11. AgentCI creates patch branch/PR. | M1 | not-started |  |
| SPEC-48-017 | 48 / 2531 | 12. Regression passes. | M1 | not-started |  |
| SPEC-48-018 | 48 / 2532 | 13. Human merges. | M1 | not-started |  |
| SPEC-48-019 | 48 / 2534 | OpenShift extension demo: | M1 | not-started |  |
| SPEC-48-020 | 48 / 2536 | 14. Tekton Pipelines as Code builds and evaluates release. | M1 | not-started |  |
| SPEC-48-021 | 48 / 2537 | 15. Tekton Chains signs provenance/evidence. | M1 | not-started |  |
| SPEC-48-022 | 48 / 2538 | 16. AgentRelease CR becomes `Verified`. | M1 | not-started |  |
| SPEC-48-023 | 48 / 2539 | 17. Argo/OpenShift GitOps deploys to sandbox/canary. | M1 | not-started |  |
| SECTION-49 | 49 / 2543 | 49. Definition of Done for Initial Build | M1 | not-started |  |
| SPEC-49-001 | 49 / 2545 | The initial build is complete when all of the following are true: | M1 | not-started |  |
| SPEC-49-002 | 49 / 2547 | - a fresh repository can run `agentci init` | M1 | not-started |  |
| SPEC-49-003 | 49 / 2548 | - `agentci validate` validates project/spec/eval config | M1 | not-started |  |
| SPEC-49-004 | 49 / 2549 | - a GitHub App installation can analyze PRs | M1 | not-started |  |
| SPEC-49-005 | 49 / 2550 | - semantic diff detects explicit spec/model/tool/policy changes | M1 | not-started |  |
| SPEC-49-006 | 49 / 2551 | - deterministic risk rules work without a model | M1 | not-started |  |
| SPEC-49-007 | 49 / 2552 | - at least two independent reviewer models can run; target three | M1 | not-started |  |
| SPEC-49-008 | 49 / 2553 | - eval results appear in a GitHub Check | M1 | not-started |  |
| SPEC-49-009 | 49 / 2554 | - confirmed findings may block merge via required check | M1 | not-started |  |
| SPEC-49-010 | 49 / 2555 | - all results are tied to exact head SHA | M1 | not-started |  |
| SPEC-49-011 | 49 / 2556 | - evidence is queryable by PR/commit | M1 | not-started |  |
| SPEC-49-012 | 49 / 2557 | - AgentCI's own repository uses the system on every PR | M1 | not-started |  |
| SPEC-49-013 | 49 / 2558 | - the product has a documented path to Tekton/OpenShift integration without forking core logic | M1 | not-started |  |
| SECTION-50 | 50 / 2562 | 50. Source and Standards References | M0 | not-started |  |
| SPEC-50-001 | 50 / 2564 | These references describe integration surfaces; AgentCI should track upstream changes rather than copy their specifications. | M0 | not-started |  |
| SPEC-50-002 | 50 / 2566 | 1. GitHub Checks REST API: https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks | M0 | not-started |  |
| SPEC-50-003 | 50 / 2567 | 2. GitHub Status Checks: https://docs.github.com/en/pull-requests/reference/status-checks | M0 | not-started |  |
| SPEC-50-004 | 50 / 2568 | 3. OpenTelemetry GenAI semantic conventions (agent spans): https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md | M0 | not-started |  |
| SPEC-50-005 | 50 / 2569 | 4. OpenTelemetry GenAI spans: https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md | M0 | not-started |  |
| SPEC-50-006 | 50 / 2570 | 5. Model Context Protocol specification: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/index.mdx | M0 | not-started |  |
| SPEC-50-007 | 50 / 2571 | 6. MCP tools specification: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx | M0 | not-started |  |
| SPEC-50-008 | 50 / 2572 | 7. OpenShift Pipelines as Code 1.20: https://docs.redhat.com/en/documentation/red_hat_openshift_pipelines/1.20/html-single/pipelines_as_code/index | M0 | not-started |  |
| SPEC-50-009 | 50 / 2573 | 8. Argo CD sync phases/waves: https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/ | M0 | not-started |  |
| SPEC-50-010 | 50 / 2574 | 9. Argo Rollouts: https://argoproj.github.io/argo-rollouts/ | M0 | not-started |  |
| SPEC-50-011 | 50 / 2575 | 10. Argo Rollouts analysis: https://argoproj.github.io/argo-rollouts/features/analysis/ | M0 | not-started |  |
| SECTION-51 | 51 / 2579 | 51. Instructions to a Coding Agent | M0 | not-started |  |
| SPEC-51-001 | 51 / 2581 | Treat this document as the top-level product and architecture specification. | M0 | not-started |  |
| SPEC-51-002 | 51 / 2583 | When implementing: | M0 | not-started |  |
| SPEC-51-003 | 51 / 2585 | 1. Do not attempt all milestones in one PR. | M0 | not-started |  |
| SPEC-51-004 | 51 / 2586 | 2. Start with Milestone 0 and create executable schemas/tests first. | M0 | not-started |  |
| SPEC-51-005 | 51 / 2587 | 3. Maintain a `/specs/implementation-status.md` mapping each numbered requirement/section to `not-started`, `in-progress`, `implemented`, or `deferred`. | M0 | not-started |  |
| SPEC-51-006 | 51 / 2588 | 4. Every PR must identify which spec sections it implements. | M0 | not-started |  |
| SPEC-51-007 | 51 / 2589 | 5. Do not silently change architecture to simplify implementation; propose spec amendments in the PR. | M0 | not-started |  |
| SPEC-51-008 | 51 / 2590 | 6. Add deterministic tests for every deterministic rule. | M0 | not-started |  |
| SPEC-51-009 | 51 / 2591 | 7. Add behavioral evals for probabilistic behavior. | M0 | not-started |  |
| SPEC-51-010 | 51 / 2592 | 8. Never treat an LLM assertion as verified evidence without labeling it. | M0 | not-started |  |
| SPEC-51-011 | 51 / 2593 | 9. Keep provider-specific code behind adapters. | M0 | not-started |  |
| SPEC-51-012 | 51 / 2594 | 10. Keep GitHub/Tekton/OpenShift integration behind integration boundaries; core domain models must remain platform-neutral. | M0 | not-started |  |
| SPEC-51-013 | 51 / 2595 | 11. Use OpenTelemetry instead of inventing a trace transport. | M0 | not-started |  |
| SPEC-51-014 | 51 / 2596 | 12. Preserve privacy defaults: metadata-only unless explicitly configured. | M0 | not-started |  |
| SPEC-51-015 | 51 / 2597 | 13. Do not enable auto-merge or production remediation by default. | M0 | not-started |  |
| SPEC-51-016 | 51 / 2598 | 14. Dogfood each newly functional layer on the AgentCI repository as soon as safe. | M0 | not-started |  |
| SPEC-51-017 | 51 / 2599 | 15. For every production defect found during dogfooding, create a regression fixture if reproducible. | M0 | not-started |  |
| SPEC-51-018 | 51 / 2601 | The first implementation objective is **a GitHub PR check that gives a reviewer materially better information than a normal diff**. Optimize early work toward that outcome. | M0 | not-started |  |
| M0-01 | 40 / 2046 | - monorepo/repo structure | M0 | tested | package.json, apps/api/server.ts |
| M0-02 | 40 / 2047 | - `agentci.yaml` JSON Schema | M0 | tested | packages/schemas/json/agent-project.schema.json |
| M0-03 | 40 / 2048 | - requirement schema | M0 | tested | packages/schemas/json/requirement.schema.json |
| M0-04 | 40 / 2049 | - finding schema | M0 | tested | packages/schemas/json/finding.schema.json |
| M0-05 | 40 / 2050 | - evidence schema | M0 | tested | packages/schemas/json/evidence.schema.json |
| M0-06 | 40 / 2051 | - trace mapping spec | M0 | implemented | docs/trace-mapping.md |
| M0-07 | 40 / 2052 | - CLI skeleton | M0 | tested | cmd/agentci/main.ts |
| M0-08 | 40 / 2053 | - basic API skeleton | M0 | tested | apps/api/server.ts |
| M0-09 | 40 / 2057 | - `agentci validate` validates this repository | M0 | tested | tests/project.test.ts |
| M0-10 | 40 / 2058 | - schemas have tests | M0 | tested | tests/schemas.test.ts |
