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

## M3-07b acceptance

Controller integration is accepted on merged source
`66a5998a4befdb48fafa283cba966f399bf032ce`; see
[the acceptance record](../../delivery/acceptance/m3-07b.json). PRs #42, #43 and
#44 passed their applicable hosted checks and advisory verification. The final
merged tree matches the combined local build, fourteen reviewer integration
checks and production-only package smoke. Opt-in UBI Compose startup and graceful
shutdown also passed. The release remains pending.

Acceptance covers immutable operator profiles, durable dispatch and complete
summaries, budget-bound reviewer execution, additive finding evidence, retries,
cancellation, independent termination recovery, seven synthetic roles and
workflow replay/privacy. Actual process loss after summary retention recovers
the same workflow without another provider call or changed charge accounting.
It does not promise safe repetition of an uncertain in-flight provider request.

Independent review reproduced and fixed a summary/terminal commitment race and
startup with missing migrations. Real PostgreSQL regression checks cover both
race orderings and missing migrations 011/012. Production startup remains opt-in
through `AGENTCI_REVIEWER_CONFIG_FILE`; see [runtime setup](m3-reviewer-runtime.md).
Customer HTTP/client/CLI integration is the next slice.

Ten local implementation commits accumulated before the first full-CI checkpoint.
The follow-up test PRs ran in parallel, but advisory queue replacement and base
changes added waiting. Their cycle time and preserved cancelled attempts are
measurement inputs, not evidence that overall delivery became faster. The
original M3 release gates and deferred live-provider acceptance remain intact.

## Parallel customer API work after M3-07b acceptance

The owner approved parallel subagents and PRs. Keep shared transport contracts
under one owner; development can overlap after the contract decisions below are
recorded. Real transport acceptance and merges still follow dependencies. These
are planned slices, not implemented or accepted customer operations.

| PR slice | Size | Owner and boundary | Acceptance and dependency |
| --- | --- | --- | --- |
| 07c-0: shared transport decisions/fixtures | S | Contract owner; internal draft contracts and scenario map | Record the shared decisions below after 07b acceptance. Freeze fixtures before parallel client/Checks development; do not publish unimplemented HTTP endpoints. |
| 07c-1: review admission/status/cancellation | M | Server owner; control routes, OpenAPI, operation map and shared fixtures | Real HTTP/PostgreSQL/Temporal; durable admission, authenticated exact retry, conflicting identity, stale head/profile, disabled consumer, cancellation and bounded errors. Starts after 07b acceptance. |
| 07c-2: findings/history/export reads | M | Server owner; scoped reads and bounded pagination | Exact-subject evidence, stable pagination, immutable history and integrity-verifiable complete export; reject truncated exports. Export remains required by M3-C11. Depends on 07c-1. |
| 07c-3: approved reproduction/lifecycle mutations | M | Server owner; reproduction routes and configured consumer | Expected-version and operation-ID checks, immutable approved plan, cancellation before/during staging, termination cleanup and retained receipt. No caller-supplied commands, images or budgets. Never-staged cancellation remains unverified. Depends on read/status contracts. |
| 07c-4: typed client and executable CLI | M | Client owner; consume frozen transport fixtures without redefining them | Real server round trips, exact identity/digest checks, bounded responses/exports, stable errors and no credential logging. Preserve released `agentci review` behavior. Develop alongside server; accept against implemented routes. Split review and reproduction commands if needed to retain reviewable scope. |
| 07d-1: model-review GitHub Checks | M | Checks owner; renderer, publication and stale-head protection | Unconfirmed and synthetic claims stay advisory; exact evidence identity, bounded escaped output and publication retries that cannot overwrite newer results. Renderer can develop against frozen summaries; integration depends on real evidence URLs/status. |
| 07d-2: packaged customer acceptance | M | Integrator; installed CLI/service/container scenario and demo | HTTP to CLI to worker to finding/reproduction to exact-head Check; seeded defect, unsupported claim, fixed result and failure/restart. Requires all preceding slices and preserves the additional M3 release gates. |

Before parallel implementation, record the shared decisions for resource naming
(model reviews must be distinct from released deterministic reviews), status and
coverage fields, read versus mutation authentication, UUID/idempotency and error
semantics, finding versions and permitted dispositions, reproduction approval,
pagination/export integrity, safe profile discovery and CLI command names.
An accepted request means durable admission, not a completed review. Completed
execution, refused roles, verification disposition, synthetic/live mode and Check
conclusion must remain distinguishable. The evidence token remains read-only;
both released API compatibility baselines remain unchanged.

Measure parallel delivery by accepted merge cycle time, CI queue/execution time,
failures and rework separately. Record superseded queued advisory runs; the
repository-wide advisory queue needs an all-open-PR sweep when pending targeted
events are replaced. Do not count additional PRs or fast checks as acceleration.
