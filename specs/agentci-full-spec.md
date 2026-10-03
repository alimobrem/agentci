# AgentCI
## Full Product and Technical Specification

**Version:** 0.1 Draft  
**Status:** Build-ready specification  
**Date:** 2026-10-03  
**Codename:** AgentCI (working name; non-normative)  
**Primary objective:** Make AI-generated and agentic software reviewable, testable, provable, deployable, observable, and capable of learning from production failures without replacing Git, existing CI/CD, or existing observability.

---

# 1. Executive Summary

AgentCI is a model-agnostic engineering control plane for software developed by humans and coding agents, and for software that itself contains autonomous or semi-autonomous agents.

AgentCI extends existing software delivery rather than replacing it. Git remains the system of record for intended change. Pull requests remain the principal review and approval mechanism. Existing CI engines remain execution engines. Existing deployment and GitOps systems remain deployment engines. OpenTelemetry remains the telemetry foundation. Model Context Protocol (MCP) is a preferred tool boundary. Existing observability platforms remain valid destinations for logs, metrics, and traces.

AgentCI adds six core capabilities:

1. **Semantic Change Intelligence** - explains changes in terms of intent, requirements, behavior, capabilities, permissions, tools, models, policies, and risk rather than only line diffs.
2. **Behavioral Eval Orchestration** - selects and runs deterministic tests, agent evaluations, adversarial scenarios, model matrices, and regression suites based on what changed.
3. **Evidence Graph** - creates a queryable lineage graph connecting requirement -> code -> test/eval -> trace -> PR -> build -> release -> deployment -> production outcome -> incident -> repair.
4. **Production Correlation** - correlates agent actions with application and infrastructure outcomes to identify likely behavior failures and regressions.
5. **Regression Learning Loop** - converts reproducible production failures into permanent executable regression cases.
6. **Risk and Autonomy Control** - independently controls what the system may detect, diagnose, fix, submit, merge, deploy, and remediate automatically.

The first commercial/product wedge is **AI PR Review / Semantic PR Review**. The deeper platform expands from PR evidence into release evidence, runtime evidence, incident learning, and controlled self-repair.

The system must work with OpenAI, Anthropic, xAI, Google, open-weight/local models, and future providers through adapters. It must support GitHub first, then GitLab and others. It must support generic CI runners, with first-class Tekton/OpenShift Pipelines integration. It must support Kubernetes/OpenShift deeply without requiring Kubernetes for the standalone product.

---

# 2. Product Principles

## 2.1 Preserve the existing software delivery system

AgentCI MUST NOT require replacing:

- Git
- GitHub/GitLab
- protected branches and CODEOWNERS
- existing unit/integration/security tests
- GitHub Actions, Tekton, Jenkins, GitLab CI, or other CI runners
- OCI registries
- SBOM/provenance/signing systems
- Kubernetes/OpenShift
- Argo CD / OpenShift GitOps
- Argo Rollouts or existing progressive delivery systems
- Prometheus, Grafana, Tempo, Jaeger, Datadog, Splunk, Sentry, or similar observability systems

AgentCI SHOULD integrate with these systems and add behavioral evidence and controls.

## 2.2 Specs and evals are executable contracts

A specification is not documentation only. Requirements MUST be identifiable and traceable to validation evidence.

## 2.3 Models produce hypotheses; evidence determines confidence

An LLM review finding MUST NOT automatically become a blocking truth merely because one or more models asserted it. High-impact findings SHOULD be validated by one or more of:

- deterministic static analysis
- failing deterministic test
- failing behavioral eval
- replay reproduction
- policy violation
- independently observed production outcome
- explicit human confirmation

## 2.4 Auto-fix is not auto-merge

The permissions to detect, diagnose, generate a fix, create a branch, open a PR, merge, deploy, and perform production remediation MUST be separately configurable.

## 2.5 Provider neutrality

No core domain entity may require a provider-specific model abstraction. Provider capabilities MAY be exposed through extensions.

## 2.6 Open telemetry and open interfaces first

Use open standards where practical:

- Git for source/version lineage
- OpenTelemetry / OTLP for telemetry
- MCP for tool discovery and invocation mediation where applicable
- OCI for artifact identity
- Sigstore/in-toto/SLSA-compatible mechanisms for signing/provenance where applicable
- JSON Schema for configuration and event schemas

## 2.7 Privacy by default

Raw prompts, model outputs, tool arguments, tool outputs, retrieved documents, source code, and production traces MAY contain sensitive data. Content capture MUST be opt-in or explicitly policy-controlled. Metadata-only operation MUST be supported.

---

# 3. Scope

## 3.1 In scope

AgentCI will support:

- Git-native project definition
- spec parsing and requirement IDs
- semantic PR diffing
- capability and permission change detection
- tool schema change detection
- model/prompt/policy/configuration change detection
- risk classification and review policy
- behavioral eval execution and aggregation
- multi-model review orchestration
- model matrix comparison
- normalized tracing for agent/model/tool/policy events
- GitHub Checks/PR annotations
- evidence graph storage and APIs
- immutable release evidence manifests
- CI adapters, including Tekton
- OpenShift-native distribution
- production telemetry ingestion
- incident candidate creation
- replay and reproduction orchestration
- production incident -> regression conversion
- controlled repair workflow and PR generation
- canary/promotion evidence integration
- self-dogfooding from early development onward

## 3.2 Explicitly out of scope for initial versions

AgentCI will not initially attempt to build:

- a general source-control platform
- a general CI runner
- a new agent framework
- a new coding agent
- a new observability database
- a new distributed tracing protocol
- a general policy language replacing OPA/Kyverno/etc.
- a general secrets manager
- a container registry
- a universal application deployment engine
- a universal benchmark ranking models for all workloads
- an opaque autonomous system that merges/deploys production changes without policy boundaries

---

# 4. Personas

## 4.1 Application developer

Needs to understand what an AI-generated PR actually changes and whether it is safe to merge.

## 4.2 Reviewer / senior engineer

Needs compressed, evidence-backed review information rather than reading thousands of generated lines.

## 4.3 Platform engineer

Needs reusable CI, policy, model, tracing, and deployment primitives across many repositories.

## 4.4 SRE

Needs correlation between agent actions, deployments, incidents, regressions, and remediations.

## 4.5 AppSec / security reviewer

Needs visibility into new permissions, tools, external effects, data access, model/provider changes, and policy bypass risk.

## 4.6 Engineering leader

Needs metrics showing review quality, regression risk, delivery speed, model effectiveness, cost, and production impact.

## 4.7 Regulated-enterprise operator

Needs self-hosted/hybrid deployment, data controls, auditability, identity, and signed evidence.

---

# 5. Primary User Journeys

## 5.1 PR review journey

1. Developer or coding agent opens a PR.
2. AgentCI receives repository event.
3. AgentCI loads project configuration and base/head commits.
4. Change Intelligence Engine computes:
   - ordinary code diff metadata
   - spec diff
   - requirement diff
   - capability diff
   - permission diff
   - tool diff
   - model/provider diff
   - prompt/instruction diff
   - policy diff
   - dependency/supply-chain diff
5. Risk Engine classifies each change.
6. Eval Orchestrator selects the minimum required verification plan.
7. Existing deterministic CI runs or is consumed as external evidence.
8. Agent behavioral evals run.
9. Independent model reviewers analyze designated dimensions.
10. Findings are deduplicated and, where possible, reproduced.
11. Evidence Graph links all artifacts.
12. GitHub Check summarizes findings and annotations.
13. Required policy determines whether the check is success, failure, neutral, or action required.
14. Human reviewers make merge decision unless policy explicitly permits automated merge.

## 5.2 Model change journey

1. PR changes `provider/model` or model policy.
2. System detects a model change.
3. Eval Orchestrator runs the same workload against base and candidate model(s).
4. Compare:
   - success rate
   - tool-selection correctness
   - policy compliance
   - latency
   - token usage
   - cost estimate
   - variance
   - scenario regressions
5. PR displays behavioral delta rather than only configuration delta.

## 5.3 Production failure journey

1. Existing monitoring, invariant checks, user feedback, or agent telemetry identifies abnormal behavior.
2. AgentCI creates an `IncidentCandidate` with release and trace lineage.
3. Correlator finds relevant agent/model/tool/deployment traces.
4. Replay service attempts deterministic/simulated/ephemeral reproduction.
5. If reproducible, Regression Generator creates a regression fixture/eval.
6. Root Cause workflow generates hypotheses and validates them.
7. Repair Orchestrator creates candidate fixes.
8. Candidate fixes are evaluated against:
   - new regression
   - full existing eval suite
   - deterministic tests
   - security/policy gates
9. Best proven candidate may be submitted as PR according to policy.
10. Merge/deploy remains governed separately.
11. Canary/progressive delivery validates the outcome.
12. Incident is closed only after defined production verification.
13. Regression remains in the permanent suite.

---

# 6. System Architecture

## 6.1 Logical architecture

```text
                        Git Provider
                            |
                       PR / Commit
                            |
                            v
                  +--------------------+
                  | Event/API Gateway  |
                  +---------+----------+
                            |
                            v
                  +--------------------+
                  | Project Resolver   |
                  +---------+----------+
                            |
          +-----------------+------------------+
          |                                    |
          v                                    v
+----------------------+             +----------------------+
| Change Intelligence  |             | Existing CI Evidence |
+----------+-----------+             +----------+-----------+
           |                                      |
           v                                      |
+----------------------+                           |
| Risk/Policy Engine   |                           |
+----------+-----------+                           |
           |                                       |
           v                                       |
+----------------------+                           |
| Eval Orchestrator    |<--------------------------+
+----+------------+----+
     |            |
     v            v
 Eval Runners   Model Reviewers
     |            |
     +------+-----+
            v
  +-----------------------+
  | Trace/Evidence Ingest |
  +-----------+-----------+
              |
              v
      +------------------+
      | Evidence Graph   |
      +----+--------+----+
           |        |
           v        v
     Git PR Check   Release Evidence
                     |
                     v
             Deployment/GitOps
                     |
                     v
                 Production
                     |
            telemetry/events
                     |
                     v
            Incident Correlator
                     |
                     v
                  Replay
                     |
                     v
             Regression/Fix PR
```

## 6.2 Control plane vs data plane

### Control plane

Responsible for:

- API and UI
- project configuration
- semantic diffing
- orchestration
- policies and autonomy decisions
- evidence graph
- incident lifecycle
- model performance history
- repair workflow coordination

### Data plane

Runs close to customer workloads and code when configured:

- eval runners
- model SDK instrumentation
- MCP gateway/proxy
- OpenTelemetry collectors
- optional Kubernetes/OpenShift operator
- ephemeral replay environments

The product MUST support SaaS, hybrid, and fully self-hosted deployment.

---

# 7. Repository Contract

## 7.1 Canonical repository layout

Recommended but configurable:

```text
repo/
  src/
  specs/
    product.md
    requirements/
  evals/
    golden/
    regression/
    adversarial/
  policies/
  prompts/
  agentci.yaml
  .agentci/
    baselines/
  .tekton/               # optional
```

## 7.2 `agentci.yaml`

Minimum example:

```yaml
apiVersion: agentci.io/v1alpha1
kind: AgentProject
metadata:
  name: cluster-sre
spec:
  source:
    defaultBranch: main
  specifications:
    include:
      - specs/**/*.md
      - specs/**/*.yaml
  implementation:
    include:
      - src/**
  evals:
    include:
      - evals/**/*.yaml
      - evals/**/*.py
  policies:
    include:
      - policies/**
  prompts:
    include:
      - prompts/**
  models:
    allowedProviders:
      - openai
      - anthropic
      - xai
      - google
    defaultRoute: standard
  ci:
    provider: auto
  telemetry:
    protocol: otlp
    contentCapture: metadata-only
  review:
    requiredCheckName: agentci/review
```

## 7.3 Configuration merge order

Highest precedence last:

1. product defaults
2. organization policy
3. repository `agentci.yaml`
4. branch/PR policy overlay if allowed
5. explicit workflow invocation parameters

Organization administrators MUST be able to mark policy fields as non-overridable by repositories.

---

# 8. Specification and Requirement Model

## 8.1 Requirement entity

```yaml
id: SPEC-142
title: Production restart requires approval
type: safety
status: active
text: >
  A production cluster restart must not execute without an approval
  from an authorized operator.
verification:
  deterministicPolicy: required
  behavioralEval: required
risk:
  severity: high
owners:
  - platform
  - security
```

## 8.2 Requirement types

- functional
- nonfunctional
- safety
- security
- privacy
- performance
- cost
- availability
- compliance
- human-approval
- business-invariant

## 8.3 Requirement lifecycle

`draft -> active -> deprecated -> retired`

A PR that removes or weakens an active safety/security requirement MUST be classified at least `high` risk by default.

## 8.4 Requirement extraction

V1 MUST support explicitly identified requirements in YAML or markdown front matter.

V1 MAY propose IDs for unstructured markdown using an LLM, but MUST present inferred requirements as `proposed` until accepted or explicitly enabled by policy.

Do not make build success dependent on perfect natural-language compilation.

---

# 9. Semantic Change Intelligence

## 9.1 Output categories

For every PR, compute:

- source/code changes
- requirement changes
- capability changes
- permission changes
- external side-effect changes
- tool/schema changes
- model/provider changes
- prompt/instruction changes
- memory/RAG changes
- policy changes
- dependency changes
- API changes
- data-schema changes
- deployment changes
- test/eval changes

## 9.2 Capability model

A capability is a normalized action the application/agent may perform.

Example:

```yaml
id: kubernetes.cluster.restart
sideEffect: destructive-or-disruptive
resourceScope:
  - cluster
attributes:
  productionAllowed: false
```

Capabilities can be derived from:

- MCP tool definitions
- function/tool schemas
- SDK registrations
- OpenAPI specs
- RBAC definitions
- explicit manifest declaration
- static analysis

## 9.3 Permission model

Permission change categories:

- no change
- scope narrowed
- scope broadened
- new read
- new write
- new destructive action
- new external network access
- new secret access
- new production access
- new data-class access

## 9.4 Behavioral diff

Behavioral diff is probabilistic evidence and MUST be labeled accordingly.

Inputs MAY include:

- base vs head eval outcomes
- base vs head normalized traces
- tool-call sequence changes
- decision/result changes
- static code/spec analysis
- model reviewer analysis

Output example:

```yaml
behaviorDiff:
  comparedScenarios: 250
  changedOutcomes: 8
  changedToolPaths: 17
  regressions: 2
  improvements: 6
  confidence: 0.91
```

## 9.5 Change Intelligence acceptance criteria

- Deterministic configuration changes MUST be exactly identified.
- Any added production write/destructive permission MUST trigger a finding even if LLM analysis is unavailable.
- The system MUST distinguish asserted/inferred findings from verified findings.
- The PR check MUST provide links to underlying evidence.

---

# 10. Risk Engine

## 10.1 Risk levels

- informational
- low
- medium
- high
- critical

## 10.2 Deterministic high-risk examples

- new production write/delete permission
- secret-reading capability
- authn/authz logic modification
- approval-policy weakening
- external data export
- payment/refund capability
- destructive DB/schema migration
- disabled safety eval
- telemetry redaction disabled for sensitive class

## 10.3 Policy example

```yaml
apiVersion: agentci.io/v1alpha1
kind: ReviewPolicy
metadata:
  name: org-default
spec:
  rules:
    - when:
        permissionChange: production-write
      setRisk: high
      require:
        - deterministic-tests
        - behavioral-evals
        - security-review
        - human-approval
    - when:
        modelChanged: true
      setRisk: medium
      require:
        - model-matrix
    - when:
        onlyDocumentation: true
      setRisk: low
```

## 10.4 Risk is multi-dimensional

Store at least:

- impact severity
- likelihood estimate
- reversibility
- blast radius
- data sensitivity
- autonomy level
- evidence confidence

Do not collapse all decisions into a single opaque LLM score.

---

# 11. Eval Orchestration

## 11.1 Eval classes

- deterministic unit tests
- integration tests
- contract tests
- policy tests
- golden behavior evals
- regression evals
- adversarial evals
- safety evals
- tool-use evals
- trajectory evals
- latency/performance evals
- cost/token evals
- model comparison evals

## 11.2 Eval selection

The orchestrator MUST select evals based on change impact.

Examples:

- prompt wording only -> targeted prompt/eval suite
- tool schema change -> all tool-contract and affected behavioral evals
- model change -> model matrix over required representative suite
- permission expansion -> permission/policy/adversarial suite
- spec change -> all mapped requirements plus coverage gap analysis
- low-level library refactor -> deterministic tests plus mapped behavior regressions

## 11.3 Statistical execution

Each eval may define trial semantics:

```yaml
trials:
  count: 20
  passRate: 0.95
  maxCriticalFailures: 0
  confidenceMethod: wilson
```

Critical safety assertions SHOULD default to zero tolerated violations in the configured sample.

## 11.4 Pluggable eval engines

Adapters SHOULD support:

- pytest/custom test commands
- DeepEval
- Promptfoo
- custom HTTP eval providers
- native AgentCI structured evals

AgentCI owns orchestration and evidence normalization, not all evaluation algorithms.

## 11.5 Eval result schema

```yaml
id: eval-run-001
suite: sre-regression
revision: sha256:...
subject:
  gitSha: abc123
  agentRelease: rc-104
scenario: REG-2841
trials: 20
passed: 20
failed: 0
metrics:
  taskSuccess: 1.0
  p95LatencyMs: 2400
  avgCostUsd: 0.041
artifacts:
  traces:
    - trace-1
    - trace-2
```

---

# 12. Multi-Model Review

## 12.1 Reviewer roles

Configure independent roles such as:

- specification compliance
- code correctness
- architecture
- security
- adversarial/breaker
- test/eval completeness
- operational reliability

## 12.2 Independence rule

The implementation model SHOULD NOT be the sole required reviewer. Policies SHOULD allow `differentProvider: true` for designated reviews.

## 12.3 Finding lifecycle

`proposed -> deduplicated -> reproduction-pending -> confirmed | unconfirmed | false-positive -> resolved`

## 12.4 Finding schema

```yaml
id: finding-82
source:
  type: model-review
  provider: anthropic
  model: example-model
category: security
severity: high
claim: Namespace validation can be bypassed.
evidence:
  files:
    - src/restart.ts:81-92
reproduction:
  status: confirmed
  test: repro-82
blocking: true
```

## 12.5 Majority vote prohibited as sole blocking mechanism

Consensus MAY increase priority, but three models making the same unsupported claim MUST NOT automatically block a PR unless configured by the customer.

---

# 13. Model Provider and Routing Layer

## 13.1 Normalized provider interface

```typescript
interface ModelProvider {
  invoke(request: ModelRequest): Promise<ModelResponse>;
  stream(request: ModelRequest): AsyncIterable<ModelEvent>;
  capabilities(): ModelCapabilities;
  estimateCost?(request: ModelRequest): CostEstimate;
}
```

## 13.2 Normalized model request

Must represent:

- messages/input
- system/developer instructions
- tool definitions
- response schema
- model parameters
- metadata
- timeout/retry policy

## 13.3 Provider adapters

Initial adapters:

- OpenAI
- Anthropic
- xAI

Next:

- Google
- OpenAI-compatible endpoints
- Ollama
- vLLM

## 13.4 Provider extensions

Portable core MUST coexist with namespaced extensions:

```yaml
providerExtensions:
  openai: {}
  anthropic: {}
  xai: {}
```

## 13.5 Model router

Not required for earliest MVP.

When enabled, router inputs include:

- task category
- repository
- language/framework
- historical eval performance
- production regression rate
- context size
- latency requirements
- cost budget
- model availability
- risk level

Routing decisions MUST be recorded as evidence.

---

# 14. Runtime Instrumentation and Tracing

## 14.1 Principle

Capture externally observable execution, not hidden chain-of-thought.

Record:

- agent invocation
- model invocation
- planning phase when explicitly exposed
- tool invocation
- tool result metadata
- handoff
- policy decision
- human approval
- external side effect
- eval annotation
- errors
- usage/latency/cost metadata

## 14.2 OpenTelemetry

OTLP is the default transport.

AgentCI SHOULD map to current OpenTelemetry GenAI semantic conventions when stable/applicable and maintain an AgentCI namespaced compatibility layer while those conventions are still in development.

## 14.3 Required AgentCI attributes

Suggested namespace:

```text
agentci.project.id
agentci.repository.id
agentci.git.sha
agentci.pull_request.number
agentci.agent.release
agentci.spec.digest
agentci.eval_suite.digest
agentci.policy.digest
agentci.capability.id
agentci.incident.id
agentci.environment
agentci.autonomy.level
```

## 14.4 Content capture modes

- `none` - no model/tool content
- `metadata-only`
- `redacted`
- `full-encrypted`
- `customer-local`

Content capture MUST be configurable separately for:

- model input
- model output
- tool arguments
- tool output
- retrieved context
- system instructions

## 14.5 SDKs

Initial SDKs:

- Python
- TypeScript/JavaScript

APIs should support:

```python
client = agentci.instrument(existing_client)
```

and manual spans for custom agent frameworks.

## 14.6 Trace correlation

All tool and downstream calls SHOULD propagate W3C trace context when possible.

For Kubernetes resources created by agent actions, optional metadata SHOULD include a safe correlation identifier, for example:

```yaml
metadata:
  labels:
    agentci.io/trace: a123
    agentci.io/release: r418
```

Use labels/annotations only where cardinality and sensitivity policies permit.

---

# 15. MCP Gateway

## 15.1 Purpose

The optional MCP Gateway mediates tool access without requiring changes to every MCP server.

```text
Agent -> AgentCI MCP Gateway -> MCP Server
```

## 15.2 Responsibilities

- tool discovery normalization
- schema snapshotting
- namespaced disambiguation
- tracing
- authorization checks
- approval checks
- argument/output redaction
- rate limiting
- side-effect classification
- allow/deny/approval policy
- tool version/evidence recording

## 15.3 Tool identity

Normalized ID SHOULD include server identity and tool name, for example:

`github.create_issue` or `prod-k8s.delete_namespace`.

## 15.4 Trust boundary

Tool annotations and descriptions from untrusted MCP servers MUST NOT be trusted as authoritative security metadata. AgentCI policy may override or classify them.

---

# 16. Evidence Graph

## 16.1 Core entities

- Organization
- Project
- Repository
- Branch
- PullRequest
- Commit
- Requirement
- SpecRevision
- Capability
- Permission
- ToolDefinition
- PromptRevision
- PolicyRevision
- ModelRoute
- EvalSuite
- EvalScenario
- EvalRun
- Trace
- Finding
- Build
- Artifact
- Attestation
- AgentRelease
- Deployment
- ProductionOutcome
- Incident
- Regression
- RepairAttempt
- Approval

## 16.2 Important edges

Examples:

- `PullRequest CONTAINS Commit`
- `Commit IMPLEMENTS Requirement`
- `EvalScenario VERIFIES Requirement`
- `EvalRun EXECUTED_AGAINST Commit`
- `Trace PRODUCED_BY AgentRelease`
- `Finding OBSERVED_IN PullRequest`
- `Incident CORRELATED_WITH Trace`
- `Regression DERIVED_FROM Incident`
- `RepairAttempt FIXES Regression`
- `AgentRelease ATTESTED_BY Attestation`
- `Deployment DEPLOYS AgentRelease`

## 16.3 Storage approach

V1 MAY use PostgreSQL with normalized tables plus JSONB and explicit edge tables. A graph database is not required initially.

Requirements:

- immutable evidence records where appropriate
- versioned entities
- stable UUIDs
- organization/tenant isolation
- retention policies
- query by PR/commit/release/incident/requirement

## 16.4 Evidence confidence

Each evidence claim SHOULD store:

- source type
- confidence
- verification status
- timestamp
- producer/version

---

# 17. GitHub Integration

## 17.1 GitHub App permissions

Minimum permissions should be determined during implementation, but likely include:

- metadata read
- contents read (or write only if auto-fix branches enabled)
- pull requests read/write for comments/metadata as needed
- checks write

Use least privilege and request write permissions only when feature enabled.

## 17.2 Webhooks

Support relevant events such as:

- pull_request opened/synchronize/reopened/closed
- push
- check_run requested_action
- installation / repository changes

## 17.3 Check structure

Primary required check:

`agentci/review`

Optional subchecks:

- `agentci/spec`
- `agentci/risk`
- `agentci/evals`
- `agentci/security`
- `agentci/model-review`

## 17.4 PR output

The check MUST contain:

- overall status
- risk level
- changed requirements
- changed capabilities
- changed permissions
- model/tool/policy changes
- eval result summary
- confirmed findings
- unresolved high-confidence findings
- links to detailed evidence

Annotations SHOULD be attached to source lines where findings map to concrete lines.

## 17.5 Requested actions

Where supported, actions may include:

- Re-run targeted evals
- Generate reproduction
- Propose fix
- Explain finding
- Mark expected behavior

No requested action may silently merge or deploy without corresponding authorization.

---

# 18. CI Integration Architecture

## 18.1 Adapter contract

```typescript
interface CIProvider {
  start(run: VerificationPlan): Promise<CIRunRef>;
  status(ref: CIRunRef): Promise<CIStatus>;
  cancel(ref: CIRunRef): Promise<void>;
  artifacts(ref: CIRunRef): Promise<ArtifactRef[]>;
}
```

## 18.2 Supported modes

- AgentCI-managed runners
- customer-managed runners
- GitHub Actions adapter
- Tekton adapter
- webhook/REST generic adapter

## 18.3 Runner isolation

Eval runners processing untrusted PR code MUST support:

- isolated container/VM/pod
- restricted network policy
- read-only credentials by default
- ephemeral workspaces
- resource quotas
- timeouts
- artifact scanning

---

# 19. Tekton and OpenShift Pipelines Integration

## 19.1 Design principle

Tekton remains an execution engine. AgentCI supplies tasks, orchestration metadata, evidence contracts, and optional controllers.

## 19.2 Reusable Tekton tasks

Provide catalog tasks:

- `agentci-semantic-diff`
- `agentci-risk`
- `agentci-eval`
- `agentci-model-review`
- `agentci-evidence-publish`
- `agentci-release-attest`
- `agentci-regression-replay`

## 19.3 Pipelines as Code

Provide example `.tekton/agentci-pr.yaml` triggering on PR events.

Example conceptual pipeline:

```text
clone
 -> semantic-diff
 -> risk
 -> deterministic-tests
 -> behavioral-evals
 -> multi-model-review
 -> evidence-publish
 -> check-update
```

## 19.4 Tekton Results

Where deployed, reference Tekton Results records rather than duplicating complete pipeline logs. Evidence Graph SHOULD store durable linkage and normalized summaries.

## 19.5 Tekton Chains

AgentCI SHOULD integrate release evidence with Tekton Chains/signing so an AgentRelease can reference signed pipeline provenance.

Agent-specific attestation subject should include immutable release inputs such as:

- source commit
- image digest
- spec digest
- prompt digest
- policy digest
- eval-suite digest
- model route/policy digest
- evidence bundle digest

---

# 20. OpenShift Distribution

## 20.1 Packaging

Provide an optional OpenShift-native distribution containing:

- Operator/OLM bundle
- AgentCI Controller
- Tekton Task catalog
- Pipelines as Code examples/integration
- Tekton Results integration
- Tekton Chains integration
- OpenShift OAuth/RBAC integration
- Console dynamic plugin (later phase)
- OpenShift GitOps integration
- OpenTelemetry integration

## 20.2 CRDs

### AgentProject

```yaml
apiVersion: agentci.io/v1alpha1
kind: AgentProject
metadata:
  name: sre-agent
spec:
  repository:
    provider: github
    url: https://example.invalid/org/repo
  specPath: specs/
  evalPath: evals/
  ci:
    provider: tekton
```

### AgentRelease

```yaml
apiVersion: agentci.io/v1alpha1
kind: AgentRelease
metadata:
  name: sre-agent-4-18-3
spec:
  projectRef: sre-agent
  source:
    gitSHA: abc123
  artifacts:
    - type: oci
      digest: sha256:...
  specification:
    digest: sha256:...
  prompts:
    digest: sha256:...
  tools:
    digest: sha256:...
  policies:
    digest: sha256:...
  modelPolicy:
    digest: sha256:...
  evalSuite:
    digest: sha256:...
  evidence:
    bundleDigest: sha256:...
status:
  phase: Verified
```

### AgentPolicy

```yaml
apiVersion: agentci.io/v1alpha1
kind: AgentPolicy
metadata:
  name: prod-default
spec:
  promotion:
    minimumBehaviorSuccess: 0.98
    criticalSafetyFailuresAllowed: 0
    requireSignedEvidence: true
    requireHumanApprovalFor:
      - production-write
      - destructive
```

## 20.3 Operator responsibilities

The operator MAY:

- validate CRDs
- reconcile release evidence status
- expose Kubernetes conditions
- integrate with Tekton results
- coordinate promotion gates
- configure optional telemetry resources

It SHOULD NOT become a replacement for Argo CD or Tekton.

---

# 21. Release Evidence and `AgentRelease`

## 21.1 Release identity

An AgentRelease MUST be immutable after verification. Changes create a new release identity.

## 21.2 Required digests

Where applicable:

- source SHA
- build artifact digest
- spec digest
- prompt/instructions digest
- tool-definition digest
- permission/policy digest
- model routing policy digest
- eval suite digest
- evidence bundle digest

## 21.3 Example evidence bundle

```json
{
  "schemaVersion": "v1alpha1",
  "release": "sre-agent-4.18.3",
  "source": {"gitSha": "abc123"},
  "specDigest": "sha256:...",
  "evalSummary": {
    "scenarios": 1482,
    "passed": 1478,
    "criticalFailures": 0,
    "taskSuccess": 0.994
  },
  "risk": "medium",
  "approvals": ["platform-owner"],
  "attestations": ["..."],
  "createdAt": "2026-10-03T00:00:00Z"
}
```

---

# 22. Deployment and Promotion

## 22.1 Promotion stages

Support configurable stages such as:

- offline eval
- sandbox
- shadow
- read-only
- approval-required actions
- canary
- broader production
- full production

## 22.2 Argo CD

AgentCI MAY provide PreSync/PostSync hooks or resource health integration but SHOULD not replace Argo CD's Git reconciliation.

## 22.3 Argo Rollouts

Integrate AgentCI production metrics/evidence with progressive delivery analysis when useful. Release promotion may be blocked or aborted based on configured behavioral metrics.

## 22.4 Promotion decision record

Every automated promotion/rollback decision MUST record:

- evaluated release
- policy revision
- evidence inputs
- metric window
- decision
- actor/system identity
- timestamp

---

# 23. Production Telemetry Ingestion

## 23.1 Sources

Support:

- AgentCI SDK spans
- generic OTLP
- MCP Gateway events
- application logs/metrics through adapters
- Kubernetes events
- audit logs where configured
- Sentry-like errors
- PagerDuty-like incidents
- user feedback events
- business KPI/invariant signals

## 23.2 Error/outcome taxonomy

An "error" may be:

- technical failure
- policy failure
- safety violation
- business invariant violation
- incorrect task outcome
- human negative feedback
- excessive cost/latency
- anomalous behavior
- external side effect mismatch

## 23.3 Business outcome API

Applications SHOULD be able to report outcomes:

```http
POST /v1/outcomes
```

```json
{
  "traceId": "a123",
  "type": "business-invariant",
  "name": "refund-within-limit",
  "status": "failed",
  "metadata": {"amount": 250}
}
```

Sensitive metadata must follow redaction policy.

---

# 24. Incident Correlation

## 24.1 Incident candidate triggers

- direct error span
- policy violation
- alert integration
- anomaly threshold
- user feedback
- business invariant failure
- deployment regression

## 24.2 Correlation signals

- shared trace ID
- release ID
- git SHA
- time proximity
- resource identity
- deployment version
- causal parent/child spans
- tool side-effect target

## 24.3 Correlation confidence

Store correlation confidence and evidence; do not assert causality solely from time adjacency.

---

# 25. Replay and Reproduction

## 25.1 Modes

### Recorded replay

Replay model/tool outputs from captured fixtures. Fast and safe, but validates orchestration more than external reality.

### Mock/simulated replay

Use generated or curated environment state.

### Ephemeral environment replay

Provision isolated resources and execute real code/tools against them.

## 25.2 Replay package

A replay package may contain:

- AgentRelease identity
- input event
- sanitized model request/response fixtures
- tool schemas
- captured tool responses
- relevant environment snapshot
- expected outcome
- policy revision

## 25.3 Replay privacy

Replay packages MUST respect capture policy and SHOULD support local-only storage.

## 25.4 Reproduction criteria

Incident can be marked reproducible only if configured threshold is met, e.g. `>= 3/5` failures or deterministic reproduction.

---

# 26. Regression Generation

## 26.1 Input

- confirmed incident
- actual behavior
- desired/expected behavior
- minimized reproduction context

## 26.2 Output

A committed or stored regression case with stable ID.

Example:

```yaml
id: REG-2841
origin:
  incident: INC-2841
input:
  request: Clean up old dev clusters.
fixtures:
  clusters:
    - {name: dev-west, env: development, ageDays: 10}
    - {name: staging-east, env: staging, ageDays: 30}
assertions:
  mustDelete:
    - dev-west
  mustNotDelete:
    - staging-east
severity: critical
```

## 26.3 Human review

For high-impact incidents, generated regression expectations SHOULD require human approval before becoming authoritative if the expected behavior was inferred rather than explicit in existing specification/policy.

---

# 27. Root Cause and Repair Orchestration

## 27.1 Root-cause classes

- implementation/code
- specification gap
- prompt/instruction
- tool schema/design
- policy
- model behavior
- model routing
- retrieval/data
- memory/state
- infrastructure
- external dependency

## 27.2 Candidate fix workflow

1. Gather incident evidence.
2. Produce root-cause hypotheses from one or more analyzers.
3. Attempt validations.
4. Create N candidate patches if appropriate.
5. Run new regression.
6. Run affected suite.
7. Run required full suite based on risk.
8. Run security and policy checks.
9. Compare candidate evidence.
10. Create branch/PR only if autonomy policy permits.

## 27.3 Candidate selection

Do not select by LLM preference alone. Prefer evidence including:

- regression pass
- full-suite non-regression
- deterministic tests
- smaller blast radius
- lower complexity
- policy compliance
- performance/cost impact

---

# 28. Autonomy Model

## 28.1 Independent permissions

Configurable actions:

- `detect`
- `diagnose`
- `create_regression`
- `generate_patch`
- `create_branch`
- `open_pr`
- `approve_pr`
- `merge_pr`
- `deploy_nonprod`
- `deploy_prod`
- `rollback`
- `execute_prod_remediation`

## 28.2 Suggested default

Initial product defaults:

- detect: auto
- diagnose: auto
- create_regression: auto-draft
- generate_patch: auto
- create_branch: allowed
- open_pr: allowed
- approve_pr: human
- merge_pr: human
- deploy_nonprod: existing CI/CD policy
- deploy_prod: existing policy/human
- rollback: existing rollout policy
- prod remediation: human approval

---

# 29. Security Architecture

## 29.1 Threats

At minimum consider:

- prompt injection through code/issues/docs
- malicious PR trying to manipulate reviewer agents
- tool-schema poisoning
- MCP server impersonation
- secret exfiltration
- cross-tenant data leakage
- compromised model provider credentials
- poisoned eval fixtures
- CI runner escape
- unauthorized auto-fix writes
- evidence tampering
- replaying stale approvals
- supply-chain compromise

## 29.2 Identity model

Distinguish:

- human user identity
- AgentCI service identity
- coding/reviewer agent identity
- model provider identity
- tool/MCP server identity
- workload identity
- delegated "acting on behalf of" identity

Audit records should permit a statement like:

`agent:sre@4.1 acting-on-behalf-of user:alice invoked tool:k8s.restart under policy:PROD-28`.

## 29.3 Secrets

- never embed provider keys in repository configuration
- integrate with secrets manager/Kubernetes secrets as deployment-specific mechanisms
- redact secret-like values from telemetry
- restrict model/tool credentials by environment and capability

## 29.4 Evidence integrity

Evidence bundles SHOULD be content-addressed and may be signed. Mutations create new versions rather than overwriting finalized records.

---

# 30. Privacy and Data Governance

## 30.1 Data classes

- public metadata
- source code
- prompts/instructions
- model inputs/outputs
- tool inputs/outputs
- retrieved enterprise data
- secrets
- PII/sensitive content

## 30.2 Controls

Support:

- field-level capture policy
- field-level redaction
- tenant retention
- regional/self-hosted storage
- encryption in transit/at rest
- audit access
- deletion where legally/operationally permitted

## 30.3 Minimal mode

AgentCI MUST function in a useful PR-review mode without storing raw production prompts or outputs.

---

# 31. API Surface

## 31.1 Core REST resources

Proposed endpoints:

```text
/v1/projects
/v1/repositories
/v1/pull-requests
/v1/change-analyses
/v1/requirements
/v1/eval-suites
/v1/eval-runs
/v1/findings
/v1/traces
/v1/evidence
/v1/releases
/v1/deployments
/v1/incidents
/v1/regressions
/v1/repairs
/v1/policies
/v1/model-routes
/v1/outcomes
```

## 31.2 Idempotency

Mutation APIs triggered by webhooks MUST support idempotency keys.

## 31.3 Event bus

Internal events SHOULD use versioned schemas. Example event types:

- `pr.analysis.requested`
- `pr.analysis.completed`
- `eval.run.requested`
- `eval.run.completed`
- `finding.confirmed`
- `release.verified`
- `incident.candidate.created`
- `incident.reproduced`
- `regression.created`
- `repair.pr.opened`

Implementation may initially use a durable queue; avoid requiring Kafka in V1.

---

# 32. CLI

Binary: `agentci`

Initial commands:

```text
agentci init
agentci validate
agentci diff [base] [head]
agentci risk
agentci eval [--suite ...]
agentci review
agentci trace inspect <id>
agentci evidence show <id>
agentci release build
agentci replay <incident|trace>
agentci doctor
```

The CLI MUST be usable locally and in CI without the SaaS control plane for core validation where possible.

---

# 33. UI

## 33.1 PR view

Show:

- intent summary
- semantic diff
- requirements changed
- capabilities/permissions changed
- models/tools/policies changed
- risk explanation
- eval deltas base vs head
- confirmed findings
- unresolved findings
- model disagreement
- evidence links

## 33.2 Application/Agent view

Show:

- current release
- git SHA
- model route
- behavioral health
- production outcome rate
- incidents
- recent model/config changes

## 33.3 Evidence explorer

Navigate requirement -> code -> eval -> trace -> release -> production.

## 33.4 Incident view

Show timeline:

`detection -> trace -> reproduction -> regression -> repair PR -> release -> production verification`

---

# 34. Metrics and Product Analytics

## 34.1 Engineering quality metrics

- behavioral regression rate
- escaped regression rate
- time to reproduce
- time to confirmed root cause
- time to repair PR
- repeat incident rate
- false-positive review rate
- human override rate

## 34.2 Delivery metrics

- PR cycle time
- review time saved estimate
- eval runtime
- cost per verified PR
- percent of PRs requiring human deep review

## 34.3 Model/router metrics

By task/repo/model:

- first-pass success
- eval pass rate
- confirmed finding rate
- regression rate
- production incident association
- latency
- cost

Do not present these as universal model rankings; they are workload-specific operational measurements.

---

# 35. Reliability Requirements

Initial targets for hosted control plane:

- API availability: 99.9% target after GA
- webhook idempotency and replay
- no loss of finalized evidence on transient worker failure
- eval jobs resumable/retryable where safe
- control-plane outage MUST NOT stop existing customer deployment systems unless the customer explicitly configured AgentCI as a required gate
- fail-open/fail-closed behavior MUST be policy-configurable by gate type

---

# 36. Scalability Requirements

Design assumptions for initial architecture:

- small org: 10 repos, <100 PRs/day
- medium: 500 repos, thousands of PRs/day
- large: thousands of repos, high-volume traces

Separate high-volume trace storage from relational control metadata. Evidence Graph can retain references to external trace backends.

---

# 37. Failure Modes

The implementation MUST handle:

- provider unavailable
- provider rate limit
- reviewer model timeout
- eval flaky/non-deterministic
- CI run cancelled
- PR force-push during evaluation
- base branch changes
- untrusted fork PR
- missing spec
- malformed policy
- unsupported model feature
- MCP server unavailable
- trace backend unavailable
- incomplete evidence
- replay impossible due to missing fixtures
- production signal ambiguous

Every result must distinguish:

- failed verification
- verification infrastructure failure
- skipped/not applicable
- inconclusive

Never report infrastructure failure as behavioral success.

---

# 38. Versioning

Version independently:

- AgentCI project schema
- evidence schema
- trace semantic mapping
- CRDs
- CLI
- SDKs
- provider adapters
- policy bundles

Backward compatibility strategy is required before beta.

---

# 39. Dogfooding Strategy

Yes: AgentCI SHOULD be dogfooded as early as possible, and the dogfood loop is itself a product requirement.

## 39.1 Bootstrap paradox

V0 cannot depend on AgentCI before AgentCI exists. Bootstrap in stages.

### Stage D0 - Manual spec-driven build

Use this document as the source spec. The coding agent builds the initial repo using normal Git/PR/CI.

Required initial repo artifacts:

```text
/specs/agentci-full-spec.md
/specs/requirements.yaml
/evals/
/agentci.yaml
```

### Stage D1 - Local CLI dogfood

As soon as `agentci diff`, `agentci risk`, and `agentci eval` exist:

- every AgentCI PR runs AgentCI locally/in CI
- outputs are stored as build artifacts
- failures do not block merge initially

### Stage D2 - GitHub Check dogfood

Install the AgentCI GitHub App on the AgentCI repository.

Every AgentCI PR receives its own semantic review.

This creates the first recursive proof:

`AgentCI reviews AgentCI.`

Initially checks are advisory.

### Stage D3 - Required check

After measured false-positive rate and stability reach agreed thresholds, make `agentci/review` required on the AgentCI repo.

Recommended gate to reach D3:

- >= 100 dogfood PRs or equivalent test corpus
- check infrastructure success >= 99%
- no known critical false-negative class in deterministic permission/risk detection
- high-severity false-positive rate acceptable to team

### Stage D4 - Runtime dogfood

Instrument AgentCI's own control-plane services with the AgentCI SDK and OTLP.

Correlate:

- model review calls
- eval runner calls
- tool calls
- GitHub API calls
- repair workflows

### Stage D5 - Incident dogfood

Feed AgentCI's own application errors and user-reported failures into Incident Correlator.

Every confirmed internal defect SHOULD become a regression when reproducible.

### Stage D6 - Auto-repair dogfood

Allow AgentCI to automatically:

- diagnose its own incidents
- generate regression drafts
- generate candidate fixes
- create branches
- open PRs

Keep merge/deploy human-governed initially.

### Stage D7 - Controlled self-healing experiments

Permit narrowly scoped auto-merge for low-risk classes only after a formal autonomy policy and rollback mechanism are demonstrated.

## 39.2 Dogfood dashboard

Track:

- AgentCI PRs reviewed by AgentCI
- findings generated
- findings confirmed
- false positives
- regressions prevented
- incidents converted to regressions
- auto-generated PRs
- accepted/rejected auto-fixes
- time saved

## 39.3 Dogfood-specific safety

Never allow a reviewer agent to modify the evidence used to judge its own PR without independent validation. Separate reviewer credentials from coding-agent credentials.

---

# 40. Build Plan

## Milestone 0 - Repository and contracts

Build:

- monorepo/repo structure
- `agentci.yaml` JSON Schema
- requirement schema
- finding schema
- evidence schema
- trace mapping spec
- CLI skeleton
- basic API skeleton

Exit criteria:

- `agentci validate` validates this repository
- schemas have tests

## Milestone 1 - Semantic PR Review MVP

Build:

- GitHub App
- webhook ingestion
- base/head checkout/resolution
- semantic diff v1
- deterministic risk rules
- GitHub Check publishing
- evidence records

V1 semantic diff MUST detect:

- spec changes
- model/config changes
- tool definitions where explicit
- permission/policy file changes where configured
- prompt changes
- dependency changes

Exit criteria:

- AgentCI repository uses advisory AgentCI check on every PR

## Milestone 2 - Eval orchestration

Build:

- eval manifest
- native command runner
- pytest adapter
- Promptfoo/DeepEval adapter as optional plugins
- result normalization
- statistical trial handling
- base/head comparison

Exit criteria:

- PR shows behavioral deltas and regression scenarios

## Milestone 3 - Multi-model review

Build:

- provider abstraction
- OpenAI adapter
- Anthropic adapter
- xAI adapter
- reviewer role templates
- finding normalization
- dedupe
- reproduction hooks

Exit criteria:

- coding model can be reviewed by a different provider
- unsupported claims remain explicitly unconfirmed

## Milestone 4 - Instrumentation

Build:

- Python SDK
- JS/TS SDK
- OTLP export
- AgentCI semantic attributes
- trace explorer linkage

Exit criteria:

- AgentCI control plane traces its own model/tool operations

## Milestone 5 - MCP Gateway

Build:

- MCP client/server proxy capability
- tool discovery forwarding
- auth passthrough/integration
- tracing
- policy hooks
- redaction

Exit criteria:

- tool invocations are visible and enforceable through gateway

## Milestone 6 - Release evidence

Build:

- AgentRelease schema
- evidence bundle generation
- signed/content-addressed evidence
- CI integration

Exit criteria:

- any verified release can be reconstructed to exact source/spec/evals/model policy

## Milestone 7 - Tekton/OpenShift flavor

Build:

- Tekton Tasks
- Pipelines as Code templates
- Tekton Results links
- Tekton Chains evidence integration
- OpenShift Operator/CRDs

Exit criteria:

- a sample OpenShift repo completes PR -> Tekton eval -> signed AgentRelease evidence

## Milestone 8 - Production feedback

Build:

- outcomes API
- incident candidate engine
- external alert adapters
- correlation
- incident UI

Exit criteria:

- a seeded production-like failure creates a correctly linked incident

## Milestone 9 - Replay/regression

Build:

- replay packages
- recorded replay
- ephemeral replay extension
- regression generation

Exit criteria:

- seeded incident is reproducible and becomes a permanent regression

## Milestone 10 - Repair orchestration

Build:

- root-cause workflow
- candidate patch workflow
- branch/PR automation
- autonomy policy

Exit criteria:

- seeded incident creates a verified repair PR without human code authoring

---

# 41. Recommended Implementation Stack

This is a recommendation, not a hard requirement.

## Control plane

- TypeScript or Go for APIs/controllers; pick one primary language to reduce complexity
- PostgreSQL for metadata/evidence graph V1
- object storage for large evidence/replay artifacts
- durable job queue
- OpenTelemetry throughout

## CLI

- Go is attractive for single binary distribution, or TypeScript if team velocity favors shared libraries

## SDKs

- Python
- TypeScript

## OpenShift operator

- Go/controller-runtime/operator-sdk style implementation

## UI

- React/TypeScript

## Policy

- internal structured rules initially; optional OPA integration for enterprise

---

# 42. Suggested Monorepo Structure

```text
agentci/
  apps/
    api/
    web/
    github-app/
  cmd/
    agentci/
  packages/
    schemas/
    change-intelligence/
    risk-engine/
    eval-core/
    provider-core/
    provider-openai/
    provider-anthropic/
    provider-xai/
    evidence/
    tracing/
    mcp-gateway/
  sdks/
    python/
    typescript/
  integrations/
    github/
    tekton/
    argo/
    openshift/
  operator/
  specs/
  evals/
  policies/
  deploy/
  docs/
```

---

# 43. Initial Database Model

Suggested tables:

```text
organizations
projects
repositories
pull_requests
commits
spec_revisions
requirements
requirement_edges
capabilities
permissions
change_analyses
findings
eval_suites
eval_scenarios
eval_runs
traces
trace_refs
builds
artifacts
attestations
agent_releases
deployments
production_outcomes
incidents
regressions
repair_attempts
approvals
policies
model_routes
```

Use immutable `created_at`; version mutable logical objects.

---

# 44. Acceptance Criteria by Product Area

## PR review

- handles PR open/update/rebase safely
- analyzes latest head SHA only
- stale runs cannot satisfy current PR gate
- annotations link to concrete evidence
- deterministic high-risk changes are detected without an LLM

## Eval orchestration

- repeatable suite selection
- base/head support
- trials and thresholds
- critical failure handling
- infra failure != pass

## Model neutrality

- no core schema embeds provider-specific response object
- at least three providers supported through adapters
- provider-specific capabilities accessible through extensions

## Tracing

- model and tool spans link to PR/release where context exists
- raw content capture disabled by default in metadata-only mode
- customer can export OTLP to their backend

## Evidence

- every check result can be traced to input commit and produced artifacts
- finalized release evidence is immutable/content-addressed

## OpenShift

- Tekton Task catalog installs cleanly
- sample PaC pipeline works from PR event
- AgentRelease CR reflects verification status
- existing Argo/OpenShift GitOps flow remains authoritative for deployment

## Feedback loop

- known incident can be correlated
- reproducible incident can generate regression
- regression runs on subsequent PRs
- repair PR includes incident and regression lineage

---

# 45. Test Strategy for AgentCI Itself

## Deterministic tests

- schema parsing
- policy/risk rules
- diff parsing
- GitHub webhook idempotency
- auth/RBAC
- provider adapter normalization
- evidence graph relationships

## Behavioral evals

Use synthetic PR corpora with known expected semantic changes.

Examples:

- harmless documentation change
- prompt change that broadens permissions
- MCP tool addition
- policy weakening hidden in refactor
- model change with behavior regression
- test deletion intended to hide failure
- malicious PR text attempting prompt injection against reviewer

## Adversarial evals

- PR description instructs reviewer to ignore policy
- source comments contain fake system instructions
- malicious MCP descriptions
- obfuscated permission broadening
- generated tests that trivially pass
- evidence tampering attempt

## Golden dogfood corpus

Every important real AgentCI bug SHOULD become a regression fixture.

---

# 46. Open Questions / Areas Requiring More Design

These MUST be tracked as design work, not hand-waved.

## 46.1 Behavioral diff correctness

How do we minimize false certainty when behavior is probabilistic? Need a formal representation of:

- observed change
- inferred change
- statistically significant change
- unknown due to insufficient trials

## 46.2 Eval coverage

Traditional code coverage does not map directly to behavioral space. Need a coverage model across:

- requirements
- capabilities
- permissions
- tools
- scenarios
- production incidents

## 46.3 Replay fidelity

Need explicit policies for what is captured, mocked, snapshotted, or re-created, especially for mutable external systems and changing hosted models.

## 46.4 Provider drift

Hosted model identifiers may change behavior over time. Need to record provider-returned model/version metadata and allow periodic baseline revalidation.

## 46.5 Causality vs correlation

Production timing correlation is insufficient to prove causality. Need confidence labels and human override.

## 46.6 Tool side-effect classification

MCP/tool metadata may be incomplete/untrusted. Need organization-managed classifications and deterministic enforcement.

## 46.7 Spec ambiguity

The product cannot promise complete formal verification of natural language. Need UX that clearly distinguishes explicit requirements from inferred interpretations.

## 46.8 Cost control

Multi-model review and repeated trials can become expensive. Need targeted eval selection, caching, budgets, and adaptive depth.

## 46.9 PR trust boundaries

Untrusted fork PR content can attack reviewer models. Need strong separation between untrusted repository content and system instructions; never expose privileged tools to analysis of untrusted code by default.

## 46.10 Self-modification / dogfood conflict

When AgentCI proposes a change to its own reviewer/risk engine, independent checks must judge that change. Define protected bootstrap rules so the component under modification cannot unilaterally weaken the gate judging itself.

---

# 47. MVP Cut Line

The minimum product worth putting in front of real engineering teams is:

1. GitHub App
2. `agentci.yaml`
3. requirement/spec parser
4. semantic diff v1
5. deterministic risk engine
6. eval runner/orchestrator
7. OpenAI + Anthropic + xAI reviewer adapters
8. finding normalization/deduplication
9. evidence store
10. GitHub Check UI
11. CLI
12. self-dogfood on AgentCI repository

Not required to prove V1 value:

- Kubernetes operator
- MCP gateway
- production incident correlation
- auto-repair
- model router
- Argo integration

Those are expansion layers.

---

# 48. MVP Demo Scenario

A strong end-to-end demo:

1. Base repo contains an SRE agent with `restart_cluster` limited to development.
2. PR changes spec/code/tool policy to allow production restart.
3. Coding agent generated 1,500+ lines.
4. AgentCI reports:
   - new production capability
   - expanded permission
   - changed requirement
   - high risk
5. Eval runs base/head.
6. One scenario shows approval bypass.
7. Independent reviewer proposes a reproducer.
8. Reproducer confirms issue.
9. GitHub Check blocks PR with concise evidence.
10. Click `Propose fix`.
11. AgentCI creates patch branch/PR.
12. Regression passes.
13. Human merges.

OpenShift extension demo:

14. Tekton Pipelines as Code builds and evaluates release.
15. Tekton Chains signs provenance/evidence.
16. AgentRelease CR becomes `Verified`.
17. Argo/OpenShift GitOps deploys to sandbox/canary.

---

# 49. Definition of Done for Initial Build

The initial build is complete when all of the following are true:

- a fresh repository can run `agentci init`
- `agentci validate` validates project/spec/eval config
- a GitHub App installation can analyze PRs
- semantic diff detects explicit spec/model/tool/policy changes
- deterministic risk rules work without a model
- at least two independent reviewer models can run; target three
- eval results appear in a GitHub Check
- confirmed findings may block merge via required check
- all results are tied to exact head SHA
- evidence is queryable by PR/commit
- AgentCI's own repository uses the system on every PR
- the product has a documented path to Tekton/OpenShift integration without forking core logic

---

# 50. Source and Standards References

These references describe integration surfaces; AgentCI should track upstream changes rather than copy their specifications.

1. GitHub Checks REST API: https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks
2. GitHub Status Checks: https://docs.github.com/en/pull-requests/reference/status-checks
3. OpenTelemetry GenAI semantic conventions (agent spans): https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md
4. OpenTelemetry GenAI spans: https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md
5. Model Context Protocol specification: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/index.mdx
6. MCP tools specification: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx
7. OpenShift Pipelines as Code 1.20: https://docs.redhat.com/en/documentation/red_hat_openshift_pipelines/1.20/html-single/pipelines_as_code/index
8. Argo CD sync phases/waves: https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/
9. Argo Rollouts: https://argoproj.github.io/argo-rollouts/
10. Argo Rollouts analysis: https://argoproj.github.io/argo-rollouts/features/analysis/

---

# 51. Instructions to a Coding Agent

Treat this document as the top-level product and architecture specification.

When implementing:

1. Do not attempt all milestones in one PR.
2. Start with Milestone 0 and create executable schemas/tests first.
3. Maintain a `/specs/implementation-status.md` mapping each numbered requirement/section to `not-started`, `in-progress`, `implemented`, or `deferred`.
4. Every PR must identify which spec sections it implements.
5. Do not silently change architecture to simplify implementation; propose spec amendments in the PR.
6. Add deterministic tests for every deterministic rule.
7. Add behavioral evals for probabilistic behavior.
8. Never treat an LLM assertion as verified evidence without labeling it.
9. Keep provider-specific code behind adapters.
10. Keep GitHub/Tekton/OpenShift integration behind integration boundaries; core domain models must remain platform-neutral.
11. Use OpenTelemetry instead of inventing a trace transport.
12. Preserve privacy defaults: metadata-only unless explicitly configured.
13. Do not enable auto-merge or production remediation by default.
14. Dogfood each newly functional layer on the AgentCI repository as soon as safe.
15. For every production defect found during dogfooding, create a regression fixture if reproducible.

The first implementation objective is **a GitHub PR check that gives a reviewer materially better information than a normal diff**. Optimize early work toward that outcome.

