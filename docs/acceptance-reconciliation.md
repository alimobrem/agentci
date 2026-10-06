# Acceptance addendum review and reconciliation

Review basis: original v0.1 specification at source commit
`8004caf94512cbce12bb3c7adcc951555b6aa0ce`; owner-provided
`AgentCI_Acceptance_Addendum_v0.1_REVIEW.docx`, SHA-256
`58c9610814b784c0c306e4b7b707651add5239c2ab36ee45bb4d1fc6f40a4714`.
All six rendered pages were inspected. The attachment remains a review proposal;
this report does not adopt its instructions or publish the attachment.

The owner requested this reconciliation and reaffirmed complete M0–M10 scope,
three provider adapters, phase-appropriate demos, historical evidence, and only
the previously approved inaccessible-model-provider exception. No new numerical
acceptance policy is adopted. No unavailable or inconclusive outcome is passed.

## Auditable checklist

[Requirement/test/evidence register](../delivery/reconciliation/requirement-test-evidence.json)
indexes 51 section files and preserves all **1,346 original inventory IDs**, their text/source identity,
implementation status and evidence. It adds staged ownership corrections,
task acceptance links, API operation/scenario/test links, evidence-file SHA-256s,
owner, blocker and rerun trigger. All 439 existing planned-owner links resolve to
their PR acceptance, and all five recorded task deferrals retain their provenance. It preserves the M0–M3 historical gate records
and the existing M3–M10 PR plan. It also exposes **29 fenced REST/CLI entries**
under their original parent IDs; proposed endpoints retain their proposed modality.

Section files are individually digested and kept below AgentCI’s per-file
review limit so the platform can review its own audit. No source row is dropped.

Regenerate with `node scripts/reconcile-acceptance.mjs`; verify with
`node scripts/reconcile-acceptance.mjs --check`. Use the project-supported Node
runtime and locked dependencies. A source-file or test-file reference is not an
executed result. Current-candidate verification starts as `not-run`: no M3 release
candidate has been selected, and historical/task passes cannot establish its
acceptance. These audit fields do not change the production result schema.

This is a reconciled register **with explicit remaining gaps**, not a certificate
that every compound clause has been decomposed or implemented. Original source
rows remain available unchanged in `specs/requirements.yaml`. Modality tokens are
recorded literally; unlabeled prose requires review rather than automated
conversion into MUST. Empty links remain visible. Section headings and examples
are inventory coverage, not independent behavioral acceptance requirements.

## Milestone ownership and demos

Every complete section 40 build and exit list remains required in addition to the
following map. The minimum proof table in the addendum cannot replace those lists.
Earlier relevant regressions run again at each affected release boundary.

| Phase | Scope retained | Phase-appropriate proof and demo |
| --- | --- | --- |
| M0 | Repository, project/requirement/finding/evidence schemas, trace mapping, CLI/API skeleton | Schema positive/negative cases; fresh checkout validation and published skeleton. Preserve historical evidence without adding retrospective service gates. |
| M1 | App/webhook, immutable base/head, all semantic categories, risk, Checks/evidence | Real PR production-permission change, deterministic high risk, advisory evidence, update/rebase/stale suppression, failure/recovery. |
| M2 | Manifest, native and pytest runners, normalization, statistical trials, base/head comparisons; optional Promptfoo/DeepEval retained | Introduced regression and clean comparison, critical failure, insufficient sample and infrastructure failure; published customer execution. |
| M3 | Provider interface; OpenAI, Anthropic, xAI; roles, findings/dedupe/reproduction; agreed customer APIs/client and authenticated initial Next.js dashboard | Seeded defect and supported reproduction, unconfirmed unsupported assertion, outage/budget/cancellation/recovery, authenticated UI of the same revision. Fixture and live portions separately labeled; unavailable live provider evidence remains unverified. |
| M4 | Python/JS instrumentation, OTLP/attributes/trace propagation, explorer, self instrumentation | AgentCI model/tool traces, external collector, bounded buffering/recovery; every capture mode and per-field policy disposition. |
| M5 | MCP discovery/invoke/auth/tracing/policy/redaction | Allowed/denied/approval-required calls, collisions, forged annotations, unavailable server, redaction failure and side-effect retry safety. |
| M6 | AgentRelease schema, signed/content-addressed evidence bundle, CI integration, exact reconstruction | Fresh-install verification/query; altered/incomplete evidence, invalid signatures and identity mismatch rejection. |
| M7 | Tekton Tasks/PaC/Results/Chains, Operator/CRDs, full OpenShift integration | Sample PR to signed verified AgentRelease; OpenShift/GitOps sandbox/canary extension, reconciliation/upgrade/least-privilege/recovery. |
| M8 | Outcomes API, incidents, external alerts/correlation, application/incident UI | Seeded production-like incident, correct release linkage, duplicate/late/malformed signals; ambiguous correlation explicitly labeled. |
| M9 | Recorded and ephemeral replay, fidelity, regression generation | Seed incident reproduces, stable regression persists on subsequent PRs; missing fixtures cannot prove reproduction. |
| M10 | Root cause, candidate patches, branch/PR creation, separate autonomy controls | Seed incident to validated repair PR without human code authoring; full repair demo with separately authorized human merge and production verification lineage. |

Concrete mapping corrections recorded in the register:

- `SPEC-44-006–026`: product-area acceptance maps across M2–M10; lineage
  `SPEC-44-017` remains cross-cutting. The previous all-M1 assignment was a
  planning placeholder, not proof of missing historical M1 scope.
- `SPEC-33.1-002–012`: initial PR UI belongs to the already agreed M3 work;
  later traces/releases/incidents/replay/repair views remain staged obligations.
  The addendum's M3 table omits this approved dashboard scope; it is retained here.
- `SPEC-48-002–023`: semantic setup M1; base/head M2; review/reproduction M3;
  automated fix/branch/PR/regression/human merge M10; OpenShift extension M7.
  `SPEC-48-014` blocking requires separately measured and approved D3 policy;
  milestone acceptance does not automatically enable required PR checks.
- `SPEC-19.2-008`: existing planning proposes M7 replay task contract/catalog,
  actual executable replay acceptance M9. This sequencing conflict remains a
  design decision for approval; a placeholder cannot pass executable M7 acceptance.
- REST/CLI fenced blocks (`SPEC-31.1-001`, `SPEC-32-002`) now have child entries.
  Full-domain operations cannot all be marked implemented by an M0 skeleton.

Three adapters (`SPEC-13.3-002–004`, `SPEC-44-012`) and at least two independent
reviewer models, target three (`SPEC-49-007`), are distinct obligations. A trusted
provider identity must differ from the coding provider (`SPEC-12.2-001`,
`SPEC-40-050`). Aliases and fixtures do not prove real independence.

## Historical evidence and present gaps

| Phase | Evidence recorded historically | Interpretation today |
| --- | --- | --- |
| M0 | `docs/releases/m0.md`, `releases/m0-manifest.json`; v0.1.0-m0, package download, 34 tests/six deterministic cases | Historical scope acceptance; no claim of model behavior or service images. |
| Expanded M1 | `docs/releases/m1-onboarding.md`, `releases/m1-gates.json`; 0.2.1-m1 at b25931c, all 18 gates recorded passed | Preserve onboarding release evidence; older M1 release document is separate history. |
| M2 | `docs/releases/m2.md`, `releases/m2-gates.json`, `releases/m2-final-acceptance-audit.json`; 0.3.1-m2 at 9bcff7d, all 18 gates recorded passed | Published artifacts, customer demo and retro remain historical results under their original observed-rate policy. |
| M3 | `releases/m3-gates.json` has null release source and 18 pending gates | In progress, unreleased. Task/PR checks are partial evidence and do not close the milestone. |
| M4–M10 | Existing proposed PR/acceptance plan retained | Future work; no phase release acceptance inferred. |

The review did not repeat historical downloads or historical test suites. New
security/provider/runtime facts require current verification before the next
release; history must not be overwritten to hide an earlier failure or claim
checks that were never performed.

Remaining M3 work includes customer reproduction mutations, complete client
round trips and retained export integration, installed customer success/failure/
fix/recovery, UI foundation/session/dashboard/browser acceptance, final scope/API/
eval/security/native-platform integration at one release source, public release,
anonymous advertised-asset downloads, released demo and consolidated closure.
Several server/client/scheduler changes have unmerged PR evidence. Their precise
commits/tests must be folded into the selected release source before closure.
Security PR56 was observed successful in Verify run 37406009732 during this
review; a GitHub success flag alone is not an artifact/content audit or publication.

Open whole-product checklist gaps must be resolved before their affected phase:

1. Split remaining compound MUST/SHOULD/MAY clauses and fenced interfaces/schemas
   into observable child acceptance items; review each modality and assign exact
   implementation and later validation ownership. Automated routing is provisional.
2. Assign GitLab/other Git providers, later Google/compatible/Ollama/vLLM adapters,
   optional router, CI modes and eval engines. Preserve recommendation/optional/
   later language; do not leave required expansion permanently ownerless.
3. Map SaaS/hybrid/self-hosted MUSTs (`SPEC-6.2-018`), offline core CLI, all REST
   surfaces, evidence queries, full UI, tenant/RBAC/OAuth, Console plugin
   (`SPEC-20.1-009`), GitOps/promotion evidence and external alert/telemetry sources.
4. M4 must cover none/metadata-only/redacted/full-encrypted/customer-local capture,
   field policies, existing-client/manual-span APIs and propagation. M0 trace
   design alone is not runtime instrumentation acceptance.
5. Attach phase-boundary failure matrices: provider outage/429/timeout/malformed
   streams/cancellation, worker death and ambiguous external writes, stale base/head,
   forks/injection, MCP/redaction/storage failure, tampered evidence, replay fidelity,
   tenant isolation/resource exhaustion/backup/migration. Preserve attempts;
   infrastructure failure and ambiguous causality cannot become success.
6. Track every §46 mandatory design item, including statistical correctness, eval
   coverage, replay fidelity, provider drift, causality, side-effect classification,
   spec ambiguity, cost, trust boundaries and dogfood self-modification.
7. D0–D7 remain separate from phase closure. D4 maps runtime M4, D5 incidents M8/9,
   D6 repair M10; D7 needs separately authorized policy and measured experiments.
8. Refresh stale phase summaries from actual merged evidence; retain failed,
   cancelled, inconclusive and unavailable attempts. Neither fast-check timing nor
   estimated Git-cache savings establishes total delivery acceleration.

## Sole approved progression exception

Only genuinely inaccessible external model-provider validation may remain
**unavailable/deferred/unverified** after every other applicable gate passes.
Implementation, provider-independent fixtures, different-provider policy enforcement,
unsupported-claim behavior, GitHub/customer acceptance, UI, recovery, packaging,
publication, anonymous downloads, release and demo remain required.

Approved decision: `M3-EXTERNAL-PROVIDER-VALIDATION-2026-10-06`, owner approval
2026-10-06T02:34:57Z; structured record is in PR57 at
`releases/m3-provider-validation-exception.json`. It affects inaccessible live
portions of `SPEC-13.3-002–004` and `SPEC-40-050`, not `SPEC-40-051`.
The record remains unmerged at the audit basis. The owner reaffirmed this narrow
exception in the present request. No new account, credential discovery or paid
call is authorized by this reconciliation.

Before qualified phase advancement, add per-provider/model/operation records with
actual access evidence, last attempt (or explicitly never attempted), fixture
coverage, remaining risk, owner, reopening trigger and next check. Do not invent
an attempted call or specific access-error evidence. Provider defects, missing
implementation, insufficient trial budget, GitHub/cluster access, unavailable
non-provider demos and publication failures are outside the exception. Qualified
advancement is not fully verified original M3 completion. Resume original live
acceptance on the relevant current revision when authorized access returns.

## Numerical and statistical decisions proposed for approval

The owner subsequently chose **retain observed-rate policy during calibration**.
See `delivery/reconciliation/policy-decisions.json`. Wilson intervals remain
descriptive; confidence-bound gates and new numerical limits are not approved.
The benchmark design remains awaiting a separate decision.

**All new defaults below are proposals only.** No acceptance result changes in this
review. Existing product-defined per-suite thresholds continue to mean what the
released policy says until an approved version/migration changes that behavior.

| Proposal | Source distinction and approval needed |
| --- | --- |
| Two-sided 95% Wilson intervals as the default for independent binary trials | Wilson appears in §11.3 examples; 95% and a universal default are new policy choices. Correlated trials need a declared alternative. |
| Confidence-bound acceptance instead of observed pass rate | New semantics. Current M2 explicitly permits 19/20 at .95 to pass while its Wilson interval remains descriptive. Version schema/policy/Checks/comparison/docs and preserve released baselines before adopting. |
| 20 diagnostic trials per stochastic scenario | Existing example, not mandatory sample size or sufficient acceptance. Do not use 20 as an automatic release gate. |
| Illustrative .95 lower-bound success target | Illustrative only; no universal .95 target proposed for immediate adoption. Set per-scenario target and sample size from calibration/precision, then obtain owner approval. Deterministic threshold1 needs a separate rule. |
| Zero sampled critical safety violations | Original SHOULD default; unconditional enforcement strengthens modality and needs an explicit disposition. Zero observed violations does not prove zero population risk. |
| 50 calibration cases; sealed 100 held-out cases; 25 per each of four categories; two independent labelers and adjudication | New corpus/annotation protocol. Recommend approving as an initial benchmark design, with explicit coverage, leakage control and benchmark weighting, before treating it as acceptance. |
| Two transport retries within one bounded deadline | New global operational limit; recommend keeping per-operation configuration until approved. Transport retries never count as new behavior trials or erase valid failures. |
| Paired effects, clustered resampling, multiplicity correction and controlled sequential stopping | New methods, not just numbers; predeclare estimand, clusters, comparison family, margins and methods before claiming significance. |
| Frozen precision/recall/false-alarm/latency/cost limits | No limits supplied. Calibrate and propose numeric limits for owner approval before opening held-out results; unresolved claims do not count as correct findings. |
| D3 ≥100 PRs/equivalent and ≥99% infrastructure success | Existing §39 recommendations; preserve observed-rate meaning. Do not silently require a 99% confidence lower bound or promote D3 on phase closure. High-severity false-positive limit remains undecided. |

For illustration, 20/20 has a two-sided 95% Wilson lower bound about .839; at
least 73 independent all-pass trials are needed to reach a .95 lower bound.
This is not a power calculation or a new acceptance sample recommendation.
A balanced four-stratum benchmark does not estimate deployment prevalence
without an explicit weighting/interpretation decision.

Current gaps: no sealed independently adjudicated quality corpus, precision/recall
uncertainty acceptance, paired-effect confidence gate, clustered/multiplicity
policy or approved numerical cost/latency limits were established by this review.
`tests/eval-statistics.test.ts` covers the existing calculation/observed policy;
that source coverage is not proof that the proposed policy already works.

## Verification of this audit

The reconciliation check and independent preservation review passed. A forged
current-pass edit was rejected. All ten local fast checks passed in 3.49 seconds
with authorized loopback access; the initial sandbox attempt failed because HTTP
servers could not listen, and both attempts are preserved in
`delivery/reconciliation/local-verification.json`. These checks validate the audit
changes; they do not certify integration, packaging, publication or M3 acceptance.

## Review disposition

Retain scope and history; use the register to resolve visible ownership/test/
evidence gaps. Approve or amend statistical choices before implementation as gates.
Do not advance beyond M3 until every other applicable gate has observed evidence
and the provider-only exception is disclosed in closure, README, release and demo.
This audit is not M3 acceptance and does not authorize automatic PR enforcement,
merge, deployment, paid provider usage or publication of the review attachment.
