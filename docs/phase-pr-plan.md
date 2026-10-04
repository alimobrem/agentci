# AgentCI phase and PR plan

Planning baseline: 2026-10-04, primary spec v0.1 section 40 and the current requirement inventory. This is a proposed execution plan, not a completion record or a promised calendar ETA. AgentCI remains an agent-first CI/CD control plane extending existing execution/deployment systems.

## Execution policy and sizing

Finish the current phase before starting the next. Planning all phases now is allowed; later implementation remains not-started. Keep Temporal for durable orchestration, PostgreSQL for control metadata/evidence references, existing eval engines, OTel/OTLP, and platform adapters. Default M2 to Docker and UBI; Podman adoption is separately deferred with retained security/stability evidence. Prefer Red Hat technology where it fits; do not rebuild Tekton, Chains, OTel, GitOps, signing or eval engines. Verify stable versions at adoption/release and pin immutable inputs then, rather than guessing future version numbers.

Each PR delivers one independently verifiable behavior with its contracts, meaningful tests/evals, docs and observability. Merge leaves the system usable; incomplete behavior is disabled explicitly. Contracts precede implementations, but a contract PR must validate fixtures and compatibility rather than add unused declarations alone. Do not batch unrelated refactors, runtime upgrades or evidence dumps into feature PRs. Target roughly 200–500 authored lines where practical; this is a review heuristic, not a gate, and generated inventories are counted separately. Split any PR whose acceptance cannot be reviewed coherently.

| Size | Initial focused effort range | Treatment |
| --- | --- | --- |
| S | 0.5–1 engineering day | One bounded contract, policy or documentation outcome |
| M | 1–3 engineering days | One component with meaningful positive/negative verification |
| L | 3–5 engineering days | Integration/acceptance work; split before coding if scope or uncertainty grows |

These estimates include applicable local validation and docs. They exclude provider/cluster access wait, human review wait and registry outages. They are low-confidence planning ranges, not agent wall-clock estimates. Re-estimate each phase at its start from actual completed comparable PRs, blocker time and acceptance workload; freeze scope, dependencies and owners before scheduling. Release PRs also include publication/download/live acceptance, so external waits remain explicit. A release row can split into preparation and acceptance follow-ups without moving the phase boundary. No XL feature is accepted without further decomposition.

Within an active phase, independent adapter/SDK implementations may run concurrently after shared contracts freeze, if parallel work is authorized and shared-file ownership is agreed. Releases and the next phase remain serial. Limit active feature PRs to two initially; use a staging branch only for explicit integration, never to hide missing acceptance.

## Existing phases and remaining M2

M0 and expanded M1 have release records; audit their existing evidence rather than recreate releases or claim newly added gates passed historically. M2 remains in-progress. PR #5 is already broad and contains core integration plus retained evidence; do not rewrite published history to create artificial small-PR metrics. Its exact 95b4d90 source passed CI run 37219379040; that is not an M2 release.

| PR boundary | Size | Depends on | Observable acceptance |
| --- | --- | --- | --- |
| M2 existing core, PR #5 | Existing large PR | Exact-source CI/review | Review core eval/API/security changes and inventories; record unresolved optional-engine finding disposition; integrate trusted main only with applicable checks |
| M2-A hosted self-review acceptance | M | Core on trusted main | New small success/regression/failure PRs exercise M2 behavioral deltas on every PR, exact head identity, retained artifacts and recovery; old M1 advisory success is insufficient |
| M2-B customer and API acceptance | M | Hosted acceptance | Fresh-repo released-candidate setup, real GitHub PR, API auth failure and exact evidence digest; input failure/recovery; copyable docs |
| M2-C release preparation/publication | L | A/B and scope/security review | Current stable input audit, immutable versions, all package/image builds and scans, GitHub release, registry publication, anonymous downloads and installed smoke |
| M2-D closure/demo/retro | S | Published downloads | Released-build behavioral success/regression/failure demo, every applicable ledger gate passed, user-visible limitations and retro; then unlock M3 |

Do not change already-started tracking dates. New PR tasks are created just before work starts using requirement IDs and observable acceptance; this plan does not pre-start future tasks. Customer acceptance requiring the final release is repeated against downloaded final artifacts before M2-D.

## Planned phases

| Phase | Planned PRs | Summed focused effort range, excluding external waits |
| --- | --- | --- |
| M3 | 9 | 12.5–29 engineering days |
| M4 | 7 | 9–23 engineering days |
| M5 | 7 | 11–25 engineering days |
| M6 | 7 | 9–23 engineering days |
| M7 | 9 | 15–33 engineering days |
| M8 | 8 | 10–26 engineering days |
| M9 | 7 | 11–25 engineering days |
| M10 | 8 | 14–30 engineering days |

These are sums of uncertain PR effort bands, not elapsed release forecasts. Parallel work, agent execution speed and external waits make calendar time different; derive that forecast from actual phase-start capacity and measured throughput.

Every row inherits API correctness/compatibility, security/privacy, meaningful positive and failure tests, docs and the final phase release gates. Dependency IDs refer to rows in the same phase unless closure is specified.

### M3 — Multi-model review

Exit demo: A real PR is reviewed by a provider different from its coding provider; a reproduced defect is confirmed, while unsupported assertions remain unconfirmed.

Inventory: 54 requirement records plus 12 section/schema review records assigned in [the ownership map](../delivery/phase-pr-plan.json).

| Planned PR | Size | Depends on | Scope and observable acceptance |
| --- | --- | --- | --- |
| M3-00: Scope and API design | S | M2 closure | Audit cross-cutting requirements and schema examples; freeze provider/review/finding contracts, versioning, budget policy and acceptance corpus before implementation. |
| M3-01: Provider core and bounded execution | M | 00 | Normalized invoke/stream/capabilities/extensions and usage; cancellation, bounded retries, unsupported-feature errors and budget exhaustion tests. |
| M3-02: OpenAI adapter | M | 01 | Official provider integration behind core; request/stream/schema conformance, redacted errors, live opt-in smoke and outage tests. |
| M3-03: Anthropic adapter | M | 01 | Same conformance corpus; explicit feature translation/unsupported capabilities; live smoke without secret leakage. |
| M3-04: xAI adapter | M | 01 | Same conformance corpus plus live smoke; do not assume endpoint similarity proves compatibility. |
| M3-05: Independent reviewer roles | M | 02,03,04 | Seven configured roles, different-provider policy, trusted context and prompt-injection evals; record model/config/context digests. |
| M3-06: Finding lifecycle and reproduction | L | 05 | Deterministic dedupe, evidence links and all lifecycle transitions; isolated reproduction hooks; consensus alone cannot establish confirmation. |
| M3-07: Customer/API/check integration | M | 06 | Review CLI and API operations with compatibility coverage, exact-head Checks, independent-provider dogfood, unsupported claims and confirmed regression demo; decide optional router/later adapters explicitly. |
| M3-08: Release and demo | L | 07 | Publish verified CLI/service artifacts; fresh customer review, provider failure recovery and released-build success/failure demo; close all gates and retro. |

### M4 — Instrumentation

Exit demo: Released Python and TypeScript SDKs export correlated OTLP traces; the AgentCI control plane traces its own model/tool operations.

Inventory: 45 requirement records plus 7 section/schema review records assigned in [the ownership map](../delivery/phase-pr-plan.json).

| Planned PR | Size | Depends on | Scope and observable acceptance |
| --- | --- | --- | --- |
| M4-01: Telemetry contracts and privacy | M | M3 closure | Version AgentCI semantic mapping and event attributes; per-field capture modes, metadata-only defaults, redaction/encryption/local-storage policy fixtures. |
| M4-02: TypeScript SDK | M | 01 | Instrument existing clients and manual spans; context propagation, errors/cancellation, opt-out and no hidden reasoning capture. |
| M4-03: Python SDK | M | 01 | Equivalent behavior and shared fixtures; supported Python matrix, async/manual spans and installed wheel smoke. |
| M4-04: OTLP and backend integration | M | 02,03 | Reuse OTel collector/exporters; W3C propagation, bounded buffers, backend outage/backpressure and metadata/content boundary tests. |
| M4-05: Trace API and explorer linkage | M | 04 | Authorized trace references, PR→eval→trace navigation and CLI inspection; tenant isolation, retention and safe Kubernetes correlation IDs. |
| M4-06: Control-plane dogfood and velocity | M | 05 | Trace AgentCI model/tool/handoff/policy/side-effect operations; correlate task/PR/CI spans and critical-path waits; unknown cost/human effort remains unknown. |
| M4-07: SDK/service release and demo | L | 06 | Publish npm/Python artifacts and changed UBI images, clean installed SDK examples, trace-backend outage demo, download verification and retro. |

### M5 — MCP Gateway

Exit demo: Real tool discovery and invocation pass through the released gateway, with visible traces and enforced allow/deny/approval policies.

Inventory: 24 requirement records plus 5 section/schema review records assigned in [the ownership map](../delivery/phase-pr-plan.json).

| Planned PR | Size | Depends on | Scope and observable acceptance |
| --- | --- | --- | --- |
| M5-01: Gateway contracts and transport | M | M4 closure | Pin current MCP capabilities/transports against official spec; client/server boundary, session lifecycle, version negotiation and cancellation fixtures. |
| M5-02: Discovery and schema snapshots | M | 01 | Forward discovery, namespace collisions and immutable tool revisions; server annotations cannot define trusted policy. |
| M5-03: Authentication and identity | M | 02 | Auth integration/passthrough with scoped identity; denied tenant, token audience and credential forwarding/leak tests. |
| M5-04: Policy and human approval | L | 03 | Structured allow/deny/approval, side-effect classification and rate budgets; approval identity/expiry, replay resistance and no unauthorized side effects. |
| M5-05: Tracing and redaction | M | 04 | Correlate invocation/result/policy evidence; redact before export/storage and preserve useful metadata during upstream failures. |
| M5-06: Gateway deploy and adversarial acceptance | M | 05 | UBI service, health/shutdown/upgrade docs and burst/outage/injection tests against real safe MCP servers; SDK/API/client example. |
| M5-07: Release and demo | L | 06 | Publish/download gateway artifacts; demonstrate allowed, denied and approval-required tools with evidence; customer setup and retro. |

### M6 — Release evidence

Exit demo: A verified release can be reconstructed to exact source, spec, evals, artifacts and model/tool/policy inputs; tampering is rejected.

Inventory: 37 requirement records plus 9 section/schema review records assigned in [the ownership map](../delivery/phase-pr-plan.json).

| Planned PR | Size | Depends on | Scope and observable acceptance |
| --- | --- | --- | --- |
| M6-01: AgentRelease contracts and immutability | M | M5 closure | Canonical schema, all required digests, versioned identity, API/CLI contracts and storage migration; finalized records cannot be overwritten. |
| M6-02: Bundle construction and storage | M | 01 | Content-addressed manifests, bounded evidence references, tenant authorization, retention and independent reconstruction verification. |
| M6-03: Signing and verification | M | 02 | Use existing signing/attestation standards; identity/trust policy and offline verification; altered digest, wrong signer and missing artifact rejection. |
| M6-04: GitHub CI integration | M | 03 | Build/verify/publish evidence from trusted source; idempotency and stale/cancelled CI rejection; agent-readable release API and CLI. |
| M6-05: Promotion decision records | M | 04 | Configured stage gates and actor/policy/window/evidence records; explicit fail behavior and Argo integration boundary, never replace GitOps. |
| M6-06: Reconstruction and velocity experiments | M | 05 | Fresh reconstruction plus missing/tampered evidence failures; measure safe affected-check reuse/merge-queue experiments with immutable inputs and full release checks. |
| M6-07: Release and demo | L | 06 | Publish/download signed evidence and service/CLI artifacts; demo exact reconstruction and rejection; migration/rollback guide and retro. |

### M7 — Tekton/OpenShift distribution

Exit demo: A real OpenShift sample PR executes through Tekton and produces signed AgentRelease evidence with verified operator status.

Inventory: 49 requirement records plus 10 section/schema review records assigned in [the ownership map](../delivery/phase-pr-plan.json).

| Planned PR | Size | Depends on | Scope and observable acceptance |
| --- | --- | --- | --- |
| M7-01: Platform ADR and CRDs | M | M6 closure | Choose supported OpenShift/OLM/operator toolchain; platform-neutral domain linkage and AgentProject/AgentRelease/AgentPolicy schemas with upgrade tests. |
| M7-02: Tekton analysis/eval task catalog | M | 01 | Semantic diff, risk, eval and model-review tasks use released core; pin inputs and isolate untrusted workspace; real TaskRun fixtures. |
| M7-03: Evidence/attestation tasks | M | 02 | Evidence publish/release attest tasks reuse M6 verifier; replay task compatibility contract explicitly awaits M9, not fake replay success. |
| M7-04: Pipelines as Code and Results | M | 03 | Real PR pipeline, scoped App integration, durable Results links, retries/cancellation and stale-head rejection. |
| M7-05: Tekton Chains verification | M | 04 | Signed provenance linkage binds all release digests; tampering and untrusted signer fail; avoid duplicating Chains. |
| M7-06: Operator reconciliation | L | 01,05 | Go/controller-runtime operator for CRDs, conditions and evidence reconciliation; RBAC, restart/idempotency and failed verification tests. |
| M7-07: OpenShift packaging/integrations | L | 06 | OLM bundle/install/upgrade, OAuth/RBAC, OTel and GitOps configuration; restricted SCC and UBI images; dynamic console plugin decision explicit. |
| M7-08: Real cluster customer acceptance | M | 07 | Fresh install and sample live PR→Tekton→signed Verified release; failed signature, outage/restart and upgrade/rollback demo rehearsal. |
| M7-09: Distribution release and demo | L | 08 | Publish operator/bundle/tasks/service artifacts; verify registry downloads and clean cluster installation; live released-build demo and retro. |

### M8 — Production feedback

Exit demo: A seeded production-like failure produces a correctly linked incident with confidence and evidence, visible through API and UI.

Inventory: 69 requirement records plus 12 section/schema review records assigned in [the ownership map](../delivery/phase-pr-plan.json).

| Planned PR | Size | Depends on | Scope and observable acceptance |
| --- | --- | --- | --- |
| M8-01: Outcome/incident contracts | M | M7 closure | Outcome taxonomy, idempotent ingestion, versioned events, tenant/retention/privacy rules and schema migrations. |
| M8-02: SDK/OTLP/gateway ingestion | M | 01 | Normalize existing trace/gateway signals with release identity; redaction, duplicates, out-of-order data and backpressure tests. |
| M8-03: External alert adapters | M | 02 | Versioned adapters for logs/metrics, Kubernetes/audit, Sentry-like and PagerDuty-like sources plus feedback/invariant signals; choose first live integrations explicitly. |
| M8-04: Candidate incident engine | M | 03 | Deterministic triggers for error/policy/alert/anomaly/feedback/invariant/deployment; dedupe, threshold and infrastructure failure distinctions. |
| M8-05: Correlation evidence | M | 04 | Trace/release/SHA/resource/causal references and confidence; time proximity alone never proves causality; ambiguous fixtures remain ambiguous. |
| M8-06: Incident and application UI/API | M | 05 | Authorized timeline/evidence/application health and outcome client; accessible views, pagination, empty/error states and tenant tests. |
| M8-07: Operational/velocity analytics | M | 06 | Workload-specific quality/cost/latency, PR/CI/release lead time and blocker metrics; explicit denominators/unknowns; controlled burst-load and seeded incident acceptance. |
| M8-08: Release and demo | L | 07 | Publish/download changed services/UI/SDKs; customer seeded failure and ambiguous-correlation demo, retention/recovery docs and retro. |

### M9 — Replay and regression

Exit demo: A seeded incident meets a configured reproduction threshold and becomes a stable regression that fails before the fix and passes after it.

Inventory: 28 requirement records plus 9 section/schema review records assigned in [the ownership map](../delivery/phase-pr-plan.json).

| Planned PR | Size | Depends on | Scope and observable acceptance |
| --- | --- | --- | --- |
| M9-01: Replay package contracts/privacy | M | M8 closure | Immutable incident/release/policy/fixture identity, local-only storage and capture consent; required fixtures/expected outcomes validated. |
| M9-02: Recorded replay | M | 01 | Deterministic orchestration replay with model/tool fixtures; no uncontrolled external side effects; missing fixtures are infrastructure/inconclusive results. |
| M9-03: Simulated and ephemeral replay | L | 02 | Curated state and isolated real-tool environments, cleanup/resource limits; label replay fidelity and wire M7 replay task once implemented. |
| M9-04: Reproduction orchestration | M | 03 | Temporal cancellation/retry/restart and configured repeated-trial thresholds; never mark one convenient retry as confirmation. |
| M9-05: Regression generation and approval | M | 04 | Stable case IDs and minimized context; explicit expected behavior provenance; human approval for inferred high-impact expectations. |
| M9-06: Customer/API/CLI acceptance | M | 05 | Replay client and evidence navigation; seeded case reproduces and committed/stored regression runs in future PR checks; privacy and failure demos. |
| M9-07: Release and demo | L | 06 | Publish/download replay tools/services/task updates; fresh install, before/after regression demonstration and replay limits, recovery docs and retro. |

### M10 — Repair orchestration

Exit demo: A seeded incident produces a verified repair PR without human code authoring, preserving human merge/production authority.

Inventory: 62 requirement records plus 7 section/schema review records assigned in [the ownership map](../delivery/phase-pr-plan.json).

| Planned PR | Size | Depends on | Scope and observable acceptance |
| --- | --- | --- | --- |
| M10-01: Repair contracts and autonomy | M | M9 closure | Repair/approval APIs, versioned policies and separate permissions for every action; human merge/approval/production defaults, actor audit and threat model. |
| M10-02: Evidence-based root-cause workflow | M | 01 | Eleven cause classes and validated hypotheses; confidence/provenance, ambiguity and provider outage; no unsupported root-cause certainty. |
| M10-03: Isolated candidate patches | L | 02 | Bounded N candidates from coding adapters; workspace/credential separation, cancellation and artifact retention; cannot alter authoritative judging evidence. |
| M10-04: Verification and candidate selection | L | 03 | New regression, affected/full suites by risk, security/policy/cost checks; choose by recorded evidence, reject empty tests/LLM preference-only selection. |
| M10-05: Branch/PR automation | M | 04 | Repository-scoped write permissions with explicit installation decision; exact verified candidate SHA, idempotency and no unsolicited merge/deploy. |
| M10-06: Repair UI/API and recovery | M | 05 | Human approval and incident→repair→release linkage; force-push/stale evidence, crash recovery and partial PR creation tests. |
| M10-07: End-to-end customer dogfood | M | 06 | Seeded incident→replay→regression→candidate→verified repair PR; reject unsafe patch and forged evidence; measure elapsed cycle/cost/rework. |
| M10-08: Release and demo | L | 07 | Publish/download all changed artifacts; live repair PR and blocked unsafe candidate demo; product-wide DoD audit, security/scale acceptance and retro. |

## Scope decisions and questions

Recommended defaults below are proposals until recorded at the stated decision point. Missing access is a blocker, not an excuse to skip live acceptance. No new credentials, account grants or external changes are authorized by this plan.

| Decision | Recommended starting point | Decide by / consequence |
| --- | --- | --- |
| M3 provider credentials, model choices and spend ceiling | Ship all three specified initial adapters; at least two independent live reviewer models, target three. Select current stable models from official catalogs at implementation, with explicit per-PR/day token/cost/time limits | M3-00; live adapter/customer gates need repository-scoped secret configuration and a user-approved budget; never request keys in chat |
| Optional model router and extra providers | Explicitly defer adaptive router, Google, compatible endpoints, Ollama and vLLM to named follow-ups; keep capability/extensions contracts now | M3-07 scope review; inventory records stay deferred if approved, not implemented. Initial OpenAI/Anthropic/xAI remain required |
| Required checks and outage behavior | Deterministic confirmed safety findings can gate; unsupported model claims stay labeled; configure fail-open/fail-closed by gate and risk | M3-00; repository rules/required checks need a concrete policy decision before enforcement |
| Privacy, trace storage and retention | Metadata-only default, customer-local content option, field-level opt-in; OTel collector and external trace backend references, no new trace database | M4-01; choose retention, encryption/key management and backend before full-encrypted claims; minimal mode must stay useful |
| MCP surface and approval UX | Current official MCP SDK/protocol, explicit supported transport matrix, safe local server fixtures; scoped credentials and human approvals for destructive actions | M5-01/04; transport/auth compatibility and approval expiry must be settled before deploy claims |
| Evidence storage/signing | S3-compatible storage boundary, local filesystem development option; existing Sigstore/cosign and standard attestations if identity trust requirements fit | M6-01/03; choose registry/store, retention and signing trust roots/identity; test offline/customer-local needs before selecting keyless-only signing |
| Argo/progressive delivery scope | Record all decisions in M6; ship bounded tested hook integration, with full OpenShift GitOps path in M7; no deployment-engine replacement | M6-05; a scope decision must list which SHOULD/MAY integrations ship versus remain deferred |
| OpenShift live test environment | Real current supported OpenShift cluster with Pipelines, Results, Chains, GitOps and OLM as appropriate; Go operator behind domain interfaces | Before M7-01; cluster access, supported-version matrix and operator catalog distribution are release dependencies; a local Kubernetes mock cannot satisfy this exit |
| Future-task ordering in Tekton catalog | Define replay task contract in M7, implement/test executable replay task only after M9 replay exists; console dynamic plugin remains explicitly later | M7-03/07; document this spec dependency amendment instead of advertising nonfunctional catalog entries as complete |
| Alerts, UI and hosting | React/TS customer views; live Kubernetes plus one chosen alert adapter first, shared conformance fixtures for remaining sources; keep local/hybrid useful | M8-01/03; user selects first production integration and reachable deployment; all supported-source claims need verified adapters, other sources need explicit disposition |
| Replay scope and fidelity | Recorded first, then real isolated ephemeral replay; label simulated/recorded limits, default no uncontrolled external writes | M9-01/03; choose environment provider and fixture retention; approved expected behavior required for inferred high-impact cases |
| Repair coding provider and permissions | Reuse provider boundaries, generate bounded candidates; open PR only, human approval/merge and existing production policy | M10-01/05; separate scoped write App/credentials require explicit access decision; current read/check App is insufficient for branch/PR writes |
| Beta/GA and support promises | Milestone releases remain prereleases unless product-wide security/privacy/compatibility/operational criteria are met | Each scope gate and M10 closure; 99.9% after-GA target is not a current measured SLA |

## Cross-cutting coverage and design audit

The existing inventory assigns some product-wide requirements to early milestones even when their full behavior depends on later work. M3-00 must reconcile sections 1–8, 16–18, 29–33, 35–39 and 41–49 with actual evidence, retain historical completion truth and assign outstanding work explicitly. Do not assume these are satisfied merely because the milestone-specific map is complete. Schema/code examples (provider interface, finding schema, CRDs, replay/outcome APIs) must be reviewed as well as bullet requirements. The machine map covers every current M3–M10 inventory entry; it deliberately does not assert every product requirement is implemented or perfectly milestone-classified.

| Shared obligation | Planned responsibility |
| --- | --- |
| Evidence entities/edges/query/confidence (16) | Each phase adds its own domain nodes/edges; M3 findings, M4 traces, M6 releases, M8 incidents, M9 regressions, M10 repairs. PostgreSQL references, immutable evidence and tenant isolation in every relevant PR |
| CI adapter/trust boundaries (17–18) | M3 live exact-head reviews; M6 CI evidence; M7 platform adapters; preserve isolated untrusted execution, stale-head rejection and independent producer identity throughout |
| Identity, secrets, privacy and integrity (29–30) | All phases; M4 capture/retention, M5 tool auth, M6 signing/storage, M8 telemetry, M9 replay, M10 repair credential separation |
| API/CLI/event contracts and customer UI (31–33) | Each feature owns its resources/operations/shared scenarios, events and installed client examples; M3 PR review, M4 evidence/trace explorer, M8 application/incident UI, M10 repair timeline. No promise to implement every proposed endpoint uncritically |
| Reliability, scale and failure taxonomy (35–37) | Each phase has cancellation/restart/idempotency/outage/tenant/resource-boundary tests; bounded load on new surfaces. M10 product-wide burst/backpressure audit; no invented uptime proof |
| Independent versioning and migration (38) | Freeze API/schema baseline per release, document incompatible migration rather than resetting baselines. Version SDKs, providers, policy, traces and CRDs independently when their contracts change |
| Dogfood and complete-product acceptance (39,44–49) | Upgrade every-PR dogfood as capabilities ship; M4 runtime traces, M8 seeded incidents, M9 replay, M10 repairs; required check enforcement reviewed before enabling. M10 audits initial-build DoD; M3 may meet MVP only after its own evidence passes |

Unresolved cross-cutting gaps found in that audit become sized PRs within their rightful phase before scope freeze. Any phase-exit change or required scope deferral needs an explicit amendment; an unfinished exit criterion still blocks release completion. Optional deferred enhancements remain named backlog items, not silently dropped.

## Release predictability and measurement

At each phase start, review its plan and decisions, create tasks and requirement/scenario mappings, confirm credentials/environments, and record a forecast range with explicit risks. API/schema versioning decisions precede implementation. Track one primary acceptance outcome per PR; discovery that expands scope triggers a visible split/re-estimate. Keep release notes and demo instructions current as PRs merge.

Each feature PR runs affected unit/contracts/evals and applicable integration/security checks. Full phase CI, clean production install, native Temporal compatibility on runtime changes, production container smoke, supported-platform inventories/scans and every release gate remain mandatory. Evals must cover seeded success, regression and infrastructure failure; zero tests, missing fixtures, skipped checks and model consensus cannot masquerade as success.

Every final phase PR must close [definition-of-done](definition-of-done.md) and its release ledger: immutable source/tag, reproducible package/image inputs, applicable tests/evals/API compatibility, license/security assessment, docs, publication, anonymous digest/checksum download and installed smoke, live customer/agent acceptance, user demo with failure case, closure and retro. Verify changed services and SDK distributions separately. Publishing alone never unlocks the next phase.

Measure from now: authored/generated diff separately; task/PR elapsed time; first actionable feedback; full CI time and cache state; queue/review/blocker time; first-pass success, reopened work and escaped defects; accepted requirements per elapsed time; and cost/human effort where measured. Preserve failed attempts and real starts. Review median/P90 after a useful comparable cohort (at least five completed samples as an initial trend screen); do not optimize PR count or claim a faster local check proves faster releases. Compare similar risk, suite, runner and cache conditions.

Smaller cohesive changes should reduce review and rollback complexity, as described in [Google's small-change guidance](https://google.github.io/eng-practices/review/developer/small-cls.html). Improved AgentCI end-to-end delivery speed is a hypothesis to test, not an observed result. The existing [velocity plan](agentic-velocity-plan.md) remains the measurement baseline.

## Ownership validation

[delivery/phase-pr-plan.json](../delivery/phase-pr-plan.json) records PR dependencies, acceptance and a primary owner for every future milestone inventory entry. Primary owner means accountable for coverage and disposition; several PRs can contribute. Section-40 build/exit records belong to the phase release owner, which must check all preceding PR evidence. Optional/later items belong to a scope-decision owner until disposition is explicit. No future task or requirement status is changed by this mapping.

Run `node scripts/check-phase-pr-plan.mjs` after changes to the plan or inventory. It checks missing/duplicate owners, phase mismatch, PR references and dependency order, and rejects omitted future inventory entries. Human scope review still validates the meaning and completeness of the underlying spec.
