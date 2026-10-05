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
