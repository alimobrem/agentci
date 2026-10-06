# Shared staging transaction prerequisite

Task M3-07c-3d-2b-1 makes the existing admission-backed evaluator staging core
composable with the controller's SQL authority transaction. It enables no HTTP
mutation, Temporal consumer, new worker permission or production execution.

The standalone `ReproductionEvalStore.stage` contract remains supported. Inputs,
source descriptors, digests, migration015 guards and evaluator privileges remain
unchanged. Preparation first bounds and detaches the snapshots, validates the
existing reservation/registry, and produces a frozen process-local handle. A
copied or serialized handle cannot be accepted; it is never a reusable permission.
After restart, prepare again from trusted retained plan and snapshot readers.

The intended internal composition is:

```ts
const prepared = await staging.prepare(planId, base, head);
await authority.withApproval(identity, planId, c => staging.stagePrepared(c, prepared));
const staged = await staging.committed(prepared);
```

`stagePrepared` uses the exact caller-owned PoolClient. It never begins, commits,
rolls back or releases that transaction. It rechecks immutable retained authority,
serializes with the existing stage/non-execution lock, checks cancellation and
validates the complete unit/source through the same connection before returning
provisional IDs. Those IDs must not enter Temporal or an evaluator until the outer
transaction commits and `committed` revalidates them and the cancellation fence.
Neither method proves that execution occurred or that a finding is confirmed.

This API is for trusted controller code. A caller must provide an open transaction
with appropriate timeouts and perform its final authority check before commit.
Temporal/network effects belong outside that transaction. The separate authority
wrapper currently redacts side-effect errors as reproduction-authority-unavailable;
a consumer must inspect durable cancellation/recovery state to classify a retry,
never treat that error as a successful or verified outcome.

Real PostgreSQL acceptance covers final permission denial (zero jobs/units),
commit/replay (one job/unit), detached snapshots, forged/cross-store handles,
pre-stage and post-commit cancellation, retained-authority corruption, and owned
backend termination after an uncommitted insert. Existing standalone acceptance
also covers restricted-role execution and legacy M2 hash/comparison/export behavior.

A cancellation can still arrive after the final post-commit check. The future
consumer must recheck authority before child dispatch and monitor cancellation,
revocation and current PR identity during execution. This prerequisite does not
replace those recovery gates, installed/released acceptance, the customer demo,
the M3 UI or any M0–M10 scope. Numerical evaluation policy is unchanged.
