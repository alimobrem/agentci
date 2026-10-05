# M3-07 customer integration PR plan

M3-06 internal finding and reproduction acceptance is complete. This plan keeps
customer integration within M3 and preserves the deferred live-provider gates.
Sizes are relative review/implementation complexity, not delivery-time promises.
Each PR needs its own applicable tests, docs, package checks and exact-head CI;
the M3 release gates remain additional requirements.

| Slice | Size | Scope | Observable acceptance |
| --- | --- | --- | --- |
| M3-07a | M | Strict review request/status contracts and durable scoped admission | Exact PR/base/head/profile identity; duplicate operation reuse; conflicting reuse rejected; restart recovery; bounded data and redacted errors. Internal contract until runtime is connected. |
| M3-07b | M | Controller registration, operator-selected reviewer configuration and durable dispatch/recovery | Real Temporal workflow executes configured roles, retains provider/budget/reviewer evidence, creates findings and resumes after worker interruption. Credentials and source stay outside workflow history. Synthetic mode cannot call external providers. |
| M3-07c | M | Authenticated REST/client/CLI review and finding operations, approved reproduction dispatch | Real HTTP and executable client/CLI round trips; write authorization separate from evidence reads; immutable subject and expected version checks; pagination and errors; compatibility with both released API baselines. |
| M3-07d | M | Exact-head GitHub Checks and customer fixture acceptance | Unverified claims remain advisory; confirmed regression and fixed-result demonstrations; stale heads cannot publish; packaged startup, failure and recovery; supported/unsupported configuration documented. |

The UI foundation follows backend integration, as already planned. No new
provider account or spending is required for these synthetic acceptance cases.
Provider independence and live model quality remain explicitly deferred where
real credentials/accounts are required; fixture success cannot close those gates.

## Decisions and boundaries

Use the existing scoped control service, PostgreSQL, and Temporal. A request
selects an operator-defined profile, not arbitrary provider URLs, commands,
images, prompt text, budgets or credentials. Resolve the exact immutable GitHub
subject through the existing authenticated reader. Bind retries to the full
request identity and preserve failed attempts.

Review and reproduction mutations need an explicit operator credential or
existing authorized dispatch mechanism. The read-only evidence token must not
gain mutation authority as a side effect. Keep public errors bounded and
redacted; retain detailed safe diagnostics internally.

Reproduction dispatch must consume the approved immutable plan and respect its
cancellation record. Recovery must handle terminated workflows and dispatch
cleanup independently; ordinary workflow cancellation acceptance alone does not
prove termination recovery. A never-staged cancelled plan has no execution
receipt and must be displayed as cancelled/unverified, never confirmed.

Public API shape, authentication, pagination, idempotency conflicts and version
semantics must be tested against real transport before adding available customer
routes to the shipped OpenAPI/client. Do not activate partial customer routes
that can enqueue work with no configured consumer. Router and additional provider
adapters retain the original explicit later-integration/optional decisions.

## Controller implementation notes for M3-07b

The existing persistent reviewer already reuses stored results and fences
ambiguous charged attempts. Build on it and the PostgreSQL budget ledger; do not
create a second provider retry/accounting implementation. Derive stable per-role
request IDs from the admitted review ID and immutable role configuration. A retry
must not invent a new request identity to bypass an ambiguous charged attempt.

Profiles bind selected role configurations, explicit evidence selection,
synthetic/external provider registrations, independence policy and a shared
operator budget scope. A fresh review request must not reset that shared budget.
Changing its immutable limit requires an explicit new operator budget identity,
with the old ledger retained. Profile revisions must remain resolvable after
restart; replacing a file must not silently reinterpret already-admitted work.

Extend the admission outbox with dispatch leases, deterministic workflow identity
and terminal status. Start before acknowledging dispatch; an ambiguous start
must resolve the existing workflow and verify its identity. Handle completion
racing with dispatch acknowledgement without overwriting terminal evidence.
Persist cancellation before contacting Temporal, including cancellation before
any workflow exists. Terminated-workflow reconciliation must be independent of
the failed parent's lifetime and preserve cleanup/failure evidence.

Synthetic providers must be explicit fixture implementations with no network
path, not a production adapter with dummy credentials. Synthetic findings remain
labelled and nonblocking. Context selection must disclose its bounds; a selected
set of files must not be presented as complete repository coverage. Runtime
configuration and profile readers remain controller-owned.

Profile retry policy should express a duration, not a permanently embedded
absolute deadline. Materialize the execution deadline once from persisted
admission/execution metadata, then reuse it across role retries. Recomputing
`now + timeout` on every retry would change the request digest and extend the
allowed execution indefinitely. Keep credential values outside profile/evidence
serialization; provider factories resolve operator-owned secret references.

The initial profile binding implementation validates one configuration per selected
reviewer role, normalizes selection ordering and budget UUIDs, and hashes all
normalized configuration into the required profile revision. It derives role
request IDs from the admitted request ID and revision. Deadlines use the persisted
admission timestamp plus the profile duration. Unit acceptance covers conflicting
revisions/modes, duplicate roles, invalid paths, detached configuration and shared
budget identity across reviews. This does not yet register providers, authorize
spending, persist profiles, dispatch workflows or prove controller recovery.

Migration 009 and `ReviewDispatchStore` add scoped dispatch leases, immutable
run identity, persistent cancellation requests, and terminal digest/status records.
Real PostgreSQL acceptance covers concurrent claims, expired lease takeover,
completion before start acknowledgement, late cancellation, tenant isolation and
restart. Database triggers preserve admitted identity, cancellation and terminal
evidence. These storage tests do not prove workflow termination cleanup; Temporal
dispatch, independent reconciliation and production registration remain required.

The Temporal dispatch boundary now has real PostgreSQL/Temporal acceptance for
start-before-ack recovery, deterministic workflow reuse, single fixture activity
execution, conflicting task-queue rejection, terminal-write retry and history
replay. `reviewAdmittedRequest` carries only IDs and result digests. Activities in
this integration test are fixtures: production profile persistence, provider and
finding activities, cancellation/termination reconciliation and worker registration
are still outstanding. These results do not prove actual provider execution.

Migration 010 and `ReviewerProfileStore` retain operator profiles by exact
normalized revision. Updating configuration adds a revision; it cannot reinterpret
an old admission. Revoked revisions remain readable for evidence but `resolve`
rejects them for execution, including after restart or config reload. Revocation
is one-way for a revision; changing policy requires a new revision. Profile budget
limits must be positive, matching `PostgresBudgetLedger`. Shared fixture and real
PostgreSQL acceptance cover these boundaries. Activity integration must check
revocation before dispatch; this store alone does not interrupt an in-flight call.
