# Operator authority and non-execution lifecycle prerequisite

Task M3-07c-3d-1 is active. This adds internal contracts and persistence only; it
activates no HTTP reproduction mutation, worker consumer or automatic config apply.

Operator config `v1alpha1` contains organization/repository, monotonically increasing
revision and up to 32 exact references: plan ID/digest, current finding ID/version/
digest, enabled flag, and UTC millisecond expiry. No commands, images, budgets,
credentials or snapshot bytes are accepted by this config contract. Controller-owned
readers resolve the approved plan/current finding and exact base/head snapshots;
existing registry compilation checks the definition, evidence and input digests.
The independent serialized config bound is 64 KiB (metadata only).

An explicit operator apply supplies the expected active revision/digest (null only
for first install). Migration016 retains immutable version rows, an active pointer
and immutable per-plan revocation tombstones. Same apply replays only while that
revision is current and its original expected identity matches. Stale applies fail;
startup only reads an expected identity and never installs config. Removing or
disabling an active approval revokes that plan ID permanently; a renewed approval
needs a new ID. A plan's other reference fields and expiry cannot mutate in place.

`withApproval` holds the active pointer lock during a bounded SQL side effect,
checks expected identity, enabled/expiry/revocation and controller-owned permission,
and checks permission/expiry again before commit. Explicit revocation waits for
already-authorized transactions and blocks subsequent ones. This linearization is
for SQL work on the supplied client; callers must not perform irreversible network
side effects inside it or treat its result as a reusable detached permission.
API and worker must use the same expected registry identity in the future consumer.

## Reviewed additive non-execution event version

Existing FindingReceipt and `v1alpha1` finding events remain unchanged. A new
`v1alpha2` history event is reserved exclusively for action
`{type:'unavailable',proofId}`. It carries `receipt:null` plus a distinct
`nonExecution` proof. The proof binds organization/repository/subject digest,
finding ID, queued version, approved plan ID/digest, original reservation operation,
and a controller-classified reason. It explicitly records executionReceipt:null
and verified:false. Cancellation is status cancelled; permanent input rejection is status unavailable.
Both are implemented in this slice. Revoked/expired/permission-denied outcome
classification remains a future consumer decision, not a caller-selected reason.
Neither supported outcome is passing evidence.

The controller retains this proof only with the same staging advisory lock and
no staged eval job or execution receipt. Cancelled proof requires a durable cancel
record; permanent rejection is classified by trusted controller code, never by a
customer/model digest. Append of the proof-backed transition is version/operation
fenced and replayable. It transitions only reproduction-pending to unconfirmed with
an error disposition, allowing a fresh approved plan for that new version. Completed
execution receipts are never replaced or reinterpreted as non-execution proofs.

Readers validate the new version explicitly; old event bytes/digests remain intact.
New-source public history/export schema support requires an additive version decision
and negative controls; immutable M1/M2 baselines are not replaced. Older clients
cannot consume new events, so upgraded reader readiness is required before consumer
activation. This prerequisite introduces no change to numerical evaluation gates.

Permission callbacks receive an abort signal and have a five-second deadline. SQL
transactions have a twelve-second callback deadline below PostgreSQL's fifteen-second
transaction limit; timeout immediately destroys the checked-out connection, causing server rollback
and rejecting queued work. It never queues ROLLBACK behind an active query where
late callback SQL could otherwise execute afterward in autocommit mode. Expiry is evaluated with database time
again before commit. Trusted snapshot readers remain controller dependencies.

## Acceptance and remaining integration boundary

The local PostgreSQL tests exercise CAS/revocation races, actual isolated runner
receipt preservation, cancellation before staging followed by fresh approval,
proof/stage mutual exclusion, rehashed proof substitution, and mixed-version history.
Independent review reproduced two defects before publication: expiry during the
final awaited permission callback, and queued SQL autocommitting after a timeout's
queued rollback. Regressions now require zero committed side effects in both cases.
These are recorded review rework, not human interventions or escaped release defects.

Compiled build and shared-reader source checks do not establish compatibility of an
already installed package with v2 events. Installed-artifact v2 acceptance remains
pending for the consumer/customer integration slice. Future consumer staging must
use the same authorized SQL transaction: calling the existing pool-owned stage
method from a withApproval callback is not atomic and is not supported as integration.
Transaction composition, reader/evaluator readiness and side-effect wiring are gates
before activation. This slice exposes no customer reproduction command or route.
