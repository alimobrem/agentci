# Abrupt review recovery

M2 candidate recovery work is in progress. Ordinary workflow cancellation already
waits for live evaluator cleanup. Forceful Temporal termination does not run the
parent workflow's cleanup; see [Temporal cancellation and termination](https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow/cancellation-and-termination.mdx).
A child cancellation request does not itself retain parent cancellation in SQL
or finish the behavioral Check. The controller must reconcile terminal attempts
independently, with durable retry and concurrency fencing. That integration is
still required before M2 acceptance.

The evaluator now exposes the internal `cleanupCancelledEvalUnit` workflow and
activity. Only the unit UUID crosses Temporal. Its own scoped SQL store verifies
that the unit is irreversibly cancelled; the immutable-state trigger prevents
new leases or result rewrites. It removes daemon containers whose verified
purpose, canonical unit ID and recorded lease ownership match that cancelled
unit. It rejects active or completed units and other deployment scopes. No
GitHub App credential, controller daemon socket or source snapshot is passed.

Cancellation after an evaluator process is killed may leave a daemon container
whose execution lease was cleared. Starting a new execution cannot recover
that cancelled unit. This independent cleanup workflow closes that evaluator
case: successful completion means no matching owned container remains.
Concurrent deletion of the exact same container is retried within a bounded
window; persistent deletion or ownership-verification failure remains an error.
Cleanup must never report a passing behavioral result. Completed observations
and the cancelled attempt stay intact.

Native acceptance observes two actually running containers, kills the owner of
one, cancels only that job and verifies active-unit and cross-scope denial,
concurrent/repeated cleanup and preservation of the other active unit. A separate
Temporal test uses the restricted evaluator SQL login, retries an interruption
after cleanup completed, rejects a completed unit and replays the cleanup
history. The tests use actual PostgreSQL, Temporal and immutable UBI runners.

Controller reconciliation, real parent termination with both children running,
controller restart/fencing, an evaluator-loss parent scenario, Checks and fresh
operator recovery, final-source CI and all release gates are still open under
`M2-TERMINATION-RECOVERY`. This file describes candidate behavior and remaining
work, not a released recovery guarantee.
