# M3-06 finding lifecycle: implementation PR plan

This is the execution breakdown for the existing M3-06 requirement set, not new
milestone scope or implementation acceptance. Implementation starts after M3-05
acceptance. Preserve SECTION-12.3, SPEC-12.3-001, SECTION-12.4, SECTION-12.5 and
SPEC-12.5-001. Customer HTTP/CLI/Checks remain M3-07.

## PR boundaries

| Slice | Size | Prerequisite | Deliverable and observable acceptance |
| --- | --- | --- | --- |
| M3-06a contract and state transitions | S | M3-05 | Versioned finding schema, shared fixture, proposed-output normalization, deterministic duplicate identity and legal transition rules. Reject forged confirmation, wrong subject, unsupported evidence and implicit blocking. Unit and adversarial fixtures cover all transitions. |
| M3-06b durable finding history | M | 06a | Tenant-scoped immutable events, idempotent writes, optimistic concurrency and reconstructed reads. PostgreSQL tests prove concurrent conflicting updates cannot both win, retry cannot duplicate events, cross-tenant reads fail, and prior evidence stays unchanged. Migration and schema ship in installed package. |
| M3-06c isolated reproduction and acceptance | M | 06b | Controller-authorized reproduction plans use the existing M2 evaluator, budgets and container ownership. Retained execution evidence drives exact-finding transitions. Real isolation tests cover positive, negative, crash, cancellation and escape attempts; frozen adversarial corpus and success/failure fixture demo complete the parent task. |

Each slice gets its own tracked task before implementation and a small PR. The
parent M3-06 remains in-progress until all three pass. A merged foundational PR
does not claim a customer-facing review is released. Run focused checks while
constructing a slice, then applicable full verification once its batch is ready.
Collect failed attempts and avoid superseding active CI with bookkeeping pushes.

## Contract decisions to carry into implementation

- Preserve the released deterministic `Analysis`/`ReviewFinding` contract. Its
  `verified`/`inferred` values describe deterministic analysis evidence and must
  not be silently relabeled as the model-finding lifecycle. Add a distinct
  versioned model-finding contract and explicit associations.
- Bind findings to organization, repository, PR and exact base/head. Derive stable
  duplicate identity from normalized claim/category and sorted exact evidence
  references within that subject. Keep contributing reviewer IDs and individual
  original claims. Avoid fuzzy cross-commit or cross-tenant merging in this slice.
- A model result can only propose a finding. Validate references against the
  selected authorized snapshot, including path, side, content digest and bounded
  line range. Text resembling a finding ID or reproduction receipt is not proof.
- Lifecycle events record actor class, previous version, reason and evidence
  identity. Implement the specified path: proposed, deduplicated,
  reproduction-pending, confirmed/unconfirmed/false-positive, resolved. Explicit
  reruns retain earlier events and require an authorized new attempt. Resolution
  needs its own evidence/reason; a new head does not silently resolve old claims.
- Confirmation requires retained successful reproduction evidence bound to the
  exact claim, subject and controller-authorized assertion. A passed process alone
  is insufficient. A crash, timeout or missing report is unconfirmed. A negative
  reproduction is not automatically a false positive; that disposition needs a
  justified, authenticated decision and retained evidence.
- Agreement may affect priority. Default blocking requires confirmed evidence
  under the configured policy. A customer override can block an unconfirmed
  finding only with explicit policy identity/reason; it cannot change the
  finding's verification state or masquerade as reproduced evidence.
- Model-proposed commands are data. Only controller-approved bounded reproduction
  plans reach M2 isolation. No App/provider credentials enter the evaluator;
  network, CPU, memory, time, process and output limits and owned cleanup remain.

## Review and demonstration checklist

06a must show duplicate claims converge while differing exact evidence remains
separate, and three agreeing unsupported reviewers remain unconfirmed/nonblocking.
06b must show a restart retrieves the same finding/history and rejected concurrent
updates leave the prior record intact. 06c must show a real fixture defect can be
confirmed with retained reproduction evidence, while an unsupported claim and a
crashed reproduction cannot be confirmed. The fixture label remains visible.

Map every new operation to requirements and executable scenarios. Add exported
customer operations only in M3-07 with both M1 and M2 compatibility gates intact.
No new account or live model call is needed for these slices. Live provider
acceptance remains explicitly deferred under `m3-live-validation-deferral.md`.
