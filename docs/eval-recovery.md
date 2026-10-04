# Abrupt review recovery

M2 candidate recovery passed component acceptance. Ordinary
workflow cancellation waits for live evaluator cleanup. Forceful Temporal
termination bypasses parent cleanup; see [Temporal cancellation and termination](https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow/cancellation-and-termination.mdx).
The controller now reconciles tracked terminal attempts independently.

Apply the checksum-bound `deploy/migrations/003_m2_review_recovery.sql` after
M1/M2 schema setup, before upgrading the controller/API. Existing migration
checksums stay unchanged. The evaluator receives no grant on this controller
table. Startup/readiness checks require the new schema.

Before starting a review, the dispatcher persists its workflow ID and evaluator
task queue. It binds the exact Temporal run ID before acknowledging dispatch.
A lost acknowledgement reconciles that execution; the review UUID cannot start
another execution after failure. Request a fresh attempt using
[`agentci review`](operator-review.md) after terminal failure or cancellation.
Repeating an ambiguous submission's UUID only recovers its receipt.

The controller polls tracked attempts through SQL leases. A lease lasts 120
seconds and is maintained during remote operations; each Temporal RPC has a
10-second deadline. Running work is rechecked after 10 seconds. A killed
reconciler leaves durable work for lease expiry and a fresh process. Token and
expiry checks fence renewal, release and closure. Shutdown retains unfinished
work and waits for the current dispatch/recovery operation before closing
connections. Unknown states or unavailable Temporal/GitHub/SQL do not certify
closure; sanitized failures retry.

For failed, cancelled, timed-out or terminated parents, scoped SQL cancellation
retains completed observations. The controller finishes the exact behavioral
Check with `action_required`, observes the original children settling and
starts deterministic independent `cleanupCancelledEvalUnit` workflows on the
recorded evaluator queue. A moved/closed PR allows terminalizing an existing
matching attempt; it never creates a new stale-head Check or publishes a passing
result. Closure is recorded only after child settlement and certified cleanup.

Only a unit UUID crosses to the recovery evaluator. Its own scoped SQL store
verifies immutable cancelled state, then removes containers whose verified
purpose, canonical unit ID and recorded lease ownership match that unit. Active
or completed units and other deployment scopes are rejected. The independent
workflow retries ambiguous completion, even when the original evaluator was
killed and its daemon container outlived its cleared execution lease. Concurrent
deletions retry within a bounded window; persistent cleanup/ownership failure
remains an error. The cancelled attempt and its observations stay intact.

Native tests observe both containers actually running before termination and
before restricted-evaluator SIGKILL. They kill a separate reconciler after SQL
cancellation but before a Check response, restart it in another process and
verify stale-lease fencing, retained evidence, removal of the exact owners, one
terminal Check and fresh-attempt recovery. Concurrent migration application,
source checksums, restricted grants and history replay are also checked.

Exact-source CI 37206277572 passes 123 unit/API/domain tests and fourteen native
integration groups with zero skips, released-M1 compatibility, production packaging
and compiled UBI service/evaluator probes. Source trees and artifact hashes are
verified in [the CI checkpoint](../releases/m2-controller-recovery-ci.json). The
[installed customer test](../releases/m2-controller-recovery-customer-local.json)
terminated a staged attempt, verified one unavailable Check and retained cancelled
exports, then passed a fresh attempt without changing prior evidence. All four
units have no leftover owned containers. The live test used queued units; running
container termination and evaluator SIGKILL are covered by native acceptance.

Milestone publication, downloads, reliable hosting and released-build demo gates
remain required. This is candidate behavior; M2 is not released.
