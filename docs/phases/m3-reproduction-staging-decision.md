# c3c evaluator source decision

Status: parent-reviewed additive design, locally implemented under active task
M3-07c-3c. Hosted acceptance and publication remain pending. No production consumer
or HTTP reproduction route is activated.

## Existing incompatibility

Customer reproduction approval.reviewId identifies agentci_review_admissions.
EvalStore.stage instead requires immutable agentci_reviews evidence, and the M2
job review_id column has a non-null foreign key to that legacy table. Existing
reproduction fixtures substitute a real legacy review ID. They cannot establish
customer-admission execution. Never create synthetic legacy review evidence solely
to satisfy this constraint or reinterpret an admission ID as a legacy review ID.

## Additive schema and version boundary

Add migration015 with an immutable nullable typed `source` JSON descriptor on
agentci_eval_jobs. Existing rows retain SQL NULL source, required non-null legacy
review_id and their exact original hash algorithm. New reproduction rows have NULL
review_id and a strict versioned descriptor:

    {schemaVersion:'v1alpha1',kind:'finding-reproduction',organizationId,
     admissionId,operationId,planId,planDigest,requestDigest,
     inputDigests:{base,head},definitionDigest}

Exactly one source is legal. This is an internal evaluator lineage version, not an
extension of released EvalComparison JSON. Preserve the existing review foreign
key for legacy rows; relax only its unconditional NOT NULL with a source union
CHECK. Generated scoped operation columns extracted from the descriptor provide a
composite FK to the immutable reproduction operation. A BEFORE INSERT authority
trigger verifies the operation-to-plan-to-admission joins, exact repository/PR/
base/head, plan ID as attempt_key, descriptor digests and single approved unit
against retained records. It rejects missing lineage or swapped sources even when
app-layer checks are bypassed. A separate immutable-source trigger rejects changing
source; retain the existing M2 job immutable trigger. A partial unique index on the
scoped reproduction operation prevents duplicate staging. Retained authority rows
are already immutable, including deletion rejection.

For reproduction only, hash `{source,attemptKey,repository,pullRequest,inputs,plan}`.
Legacy hashing remains `{reviewId,attemptKey,repository,pullRequest,inputs,plan}`
without added nulls, kind fields or normalization. Unit loading validates the
strict source descriptor and correct hash variant. It does not need SELECT on
admissions, approval configuration or reproduction tables: the evaluator keeps its
existing least-privilege grants on jobs/units/trials. Source contains bounded IDs
and digests only, not operator credentials. Controller insertion validates complete
approved plan and snapshots; evaluator sees the existing projected inputs/limits.

## Methods and compatibility

Add a controller-only admission-backed reproduction staging method/module. It
accepts immutable persisted reservation identity, resolves the trusted plan and
exact admission, rechecks cancellation and compiles snapshots before staging.
Callers cannot pass a new runner, suite, budget, plan or admission authority. It
uses shared existing definition/input validation rather than duplicating evaluator
semantics. Same operation and inputs replay to the same job/unit; substituted bytes
conflict. Keep the old EvalStore.stage method and old reproduction fixture path.

Keep the public M2 comparison/export surfaces legacy-only. New-source rows raise an
explicit typed UnsupportedEvalSource error; transport maps that to a documented
409 unsupported-eval-source before response headers/stream output. Preserve existing
responses byte-for-byte for legacy sources and both immutable compatibility
baselines. This additive error is a deliberate new-source rejection, not an
admission disguised as an EvalComparison.reviewId. It requires the narrow OpenAPI
error documentation and actual HTTP acceptance, not a baseline replacement.

Keep existing recoveryPlan returning a legacy reviewId; filter/reject new sources
explicitly. Add a typed reproduction recovery reader with the source descriptor,
unit identities and immutable subject. FindingReproductionStore uses the new path
only for c3b reservations; existing internal legacy plans retain their prior path.
Unit leases, trial checkpoints, completion validation and cancellation stay shared.
Do not change observed-rate statistics or result semantics.

Code must keep legacy startup/read behavior before migration015: use safe row JSON
projection of the optional source column for common readers, or explicitly review
an all-process migration prerequisite. New reproduction staging requires015 and
fails closed when absent. No caller-controlled fallback to legacy authority.

## Observable acceptance before acceptance/publication

- Real PG stages from model admission + plan + operation with zero legacy review
  rows; repeated staging and concurrent retries return exact job/unit identities.
- A direct SQL insert cannot omit/substitute admission, operation, plan, subject or
  descriptor digests. Wrong snapshot bytes, changed runner/assertion inputs and
  changed operation identity fail; rollback leaves no partial units/job.
- Tampered job source/hash, plan or operation lineage is rejected on controller
  staging/replay; privileged fixture corruption is isolated and explicit.
- Existing evaluator role reads/claims/checkpoints/completes the new unit without
  permissions on authority tables; cancellation/recovery retains original source.
- Legacy M2 stage hash and public comparison/export bytes remain unchanged. Actual
  HTTP requests for a new-source job receive the typed rejection, including export
  before streaming; M1/M2 baseline compatibility and existing persistence/lease/
  checkpoint/recovery tests pass. Missing migration activation fails safely.
- No new HTTP reproduction route, dispatcher or production consumer is activated.

Reviewed decision: the nullable source descriptor plus generated FK/authority
trigger is used to a separate evaluator table family, which would duplicate
leases/trial persistence and execution. A legacy-review bridge is rejected because
it either fabricates evidence or unnecessarily requires running semantic review
before an already-authorized admitted finding can reproduce.

## Canonical bytes, privileges and rollout boundary

Migration015 authenticates source file bytes against the immutable approved plan's
input digests. Controller-generated canonical text is stored alongside JSONB; SQL
requires structural equality with stored input JSON and hashes the exact UTF-8
canonical text. It never substitutes PostgreSQL JSONB text formatting for Node's
canonical form. The worker independently recomputes canonical file and definition
digests before use, preventing a recomputed job hash from authorizing new scripts.
Source org/repository must match the singleton deployment scope and the joined
operation/plan/admission; the plan subject must equal the admitted subject.

Existing evaluator grants remain unchanged. A separate restricted PostgreSQL login
proves claim, checkpoint retention, retry and completion while authority tables and
job/definition writes are denied. The fixture uses the same table/column grants in
its unique schema; it does not claim the public-schema startup privilege preflight
was exercised there. Existing M2 acceptance separately covers that preflight.

Before enabling any c3 consumer, drain old evaluator workers and require updated
consumer/evaluator readiness with migration015. An old evaluator binary cannot
validate new-source hashes; mixed-version processing is not supported or claimed.
Apply migrations in order, preflight schema and registry, then activate a future
scoped consumer. No new-source job is emitted by current production wiring.
Never fall back to a legacy review when migration015 or retained authority is absent.

Local evidence is recorded in `delivery/acceptance/m3-reproduction-staging-local.json`.
The actual runner assertion and receipt test creates no legacy review rows; separate
legacy regression tests retain their original fixture paths and semantics.
