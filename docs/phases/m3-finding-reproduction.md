# M3-06c isolated finding reproduction

Development slice acceptance passed; see `delivery/acceptance/m3-06c.json`.
Local and hosted checks, package acceptance and the development demo are recorded. Customer API/CLI
integration follows in M3-07; this document describes the internal contract.

A model proposes a finding. The controller approves an exact reproduction plan
bound to its finding version, review identity, source digests, assertion bytes,
immutable runner image and execution limits. The authorizer must retrieve the
whole approved plan from trusted controller state. Returning caller-provided
plans from that reader would bypass the authorization boundary.

`compileFindingReproduction` requires structured scenario observations and an
explicit expected result. A command exit code alone cannot confirm a finding.
The selected source must contain the finding's exact evidence. Assertions are
pinned independently of the candidate source, and cannot replace an evidence
path. HTTP providers and model matrices are excluded from this local execution
contract. The compiler validates evidence; the authorizer grants permission.

`FindingReproductionStore.reserve` persists one immutable plan per pending
finding version. Repeated requests reuse the same reservation; attempts are
bounded per finding. `stage` creates an ordinary isolated evaluation unit using
the existing immutable input store. The evaluator receives only a unit ID and
has no new grants on reproduction plans or receipts. The approved engine must match the operator engine; memory, CPU,
process and trial limits must fit the operator's bounds before a lease is taken.

The worker executes using the existing container isolation and trial checkpoints.
`finalize` validates the terminal unit against the entire plan and stores an
immutable receipt before advancing finding history. A crash between those writes
can retry the same operation. Positive scenario observations confirm the finding;
negative observations, crashes and cancellation leave it unconfirmed. These
synthetic fixture findings do not establish customer production acceptance.

Cancellation first persists an immutable scoped cancellation record. Staging
checks it before and after writing the eval job, preventing a retry or concurrent
staging call from dispatching a cancelled plan. If no unit was ever staged, no
execution receipt is fabricated; the finding remains unverified.
Cancellation records terminal SQL state and prevents another execution lease.
The controller must dispatch the existing cancelled-unit cleanup workflow and
wait for cleanup completion; `cancel` alone is not proof that a container stopped.
A cancellation arriving after unit completion preserves its terminal receipt;
the mutable job cancellation flag cannot rewrite completed evidence.
The integration test observes a live owned container, cancels its lease, waits
for worker termination and cleanup, and verifies no retained result or container.

Migration 007 follows migration 006 and the M2 evaluation schema. It includes
checksum validation, scoped foreign keys, and update/delete rejection for plans
and receipts. PostgreSQL administrators remain trusted. Integration tests cover
approval changes, duplicate reservations/staging, premature confirmation,
resource rejection, fixed and crashing assertions, queued/live cancellation,
report symlink escape rejection, and receipt recovery after connection restart.
Operation mappings are in `specs/api/finding-operations.json`.

The controller activity factory loads exact retained revisions and exposes only
stage, finalize and cancel operations to the reproduction workflow. The workflow
uses the existing evaluator child and cleanup workflow types. Local Temporal
acceptance simulates ambiguous activity responses, proves a single evaluator
dispatch, cancels during staging, and replays both histories. Database/container
acceptance separately exercises the activity factory against real execution.
Additional end-to-end cases run the real controller activities, PostgreSQL store
and isolated evaluator through Temporal for successful and cancelled execution;
these also check retained receipts, cleanup and parent history replay.
Production worker registration and authenticated approval dispatch belong to
the planned M3-07 customer integration; no customer route is enabled by exporting this internal module.

The frozen finding suite now includes the reproduction contract assertions and
fixture dependencies. Its mutation verifier removes finding identity and run
identity guards independently and requires each corresponding scenario to fail.
The isolated frozen-corpus test also replaces the candidate harness, assertion
test and fixture with no-op code while removing the execution identity guard.
Pinned baseline assertions still detect the regression. Hosted execution of this
new acceptance test passed in full CI run 37379383135. The separate hosted
review correctly retains the older baseline assertions; its report explicitly
records the added reproduction scenario as a suite change.
