# M3-07c-3a reproduction approval prerequisite

Development-only internal registry. No customer reproduction route, configuration
loader, workflow registration or dispatch is introduced. M3-07c-3 retains its
M3-07c-2 dependency and remains pending; this independent prerequisite depends on
accepted M3-06c lifecycle and reproduction contracts.

`packages/findings/approval-registry.ts` accepts privileged operator entries
containing the current finding, complete approved plan and exact retained base/head
snapshots. It snapshots inputs before asynchronous validation, recomputes the legal
queue successor with the existing lifecycle, recompiles the assertion/runner/limits
plan, and rejects any mismatch. At most 32 entries and 32 MiB total serialized
configuration are accepted. Source snapshots are discarded after compilation;
the registry retains only plans and current-finding/plan digests. Duplicate IDs
are rejected. This is not an ingestion interface for repository/model data.

A selector contains exactly subject, expectedVersion, operationId, approvalId and
approvalDigest; it is at most 8 KiB. The approval digest is the canonical complete
plan digest, not merely an ID, assertion digest or caller proof of authority.
Selection requires the authenticated current finding as a separate controller
input and binds its complete digest. Plans approve the exact queue successor:
current deduplicated/unconfirmed version N becomes reproduction-pending N+1.
The existing legal lifecycle is preserved, rather than inventing a proposed state.
Versions above 9998 cannot begin reproduction because queue and terminal evidence
must fit the existing 10,000-event bound. A request cannot supply commands, images,
URLs, credentials, budgets, confirmation state or substitute executable bytes.
Returned selections are detached and do not mutate stored operator authority.

This helper does not authenticate HTTP callers, grant permission, reserve attempts,
resolve a review's finding membership, check approval expiry/revocation, or dedupe
requests. No successful selection means work has been queued. An immutable registry
instance can be replaced by an operator; the future coordinator must recheck its
current authority at the mutation/dispatch boundary. No operator approval is
inferred from a hash match or from model consensus.

## Next smallest mutation slice: durable reproduction submission

M3-07c-3b must freeze authority lifetime/revocation and response contracts, then add
one submission/read/cancel vertical slice. Preserve the frozen customer contract:
write credential distinct from read credential, exact subject and expected version,
server-owned plan/reproduction ID, explicit consumer readiness, immutable approved
inputs, no request-selected execution controls. Resolve the approval's reviewId
through the durable admission and trusted finding membership before accepting work.

The existing `FindingHistoryStore.transition(queue)` and
`FindingReproductionStore.reserve` use separate transactions. They cannot simply
be called sequentially from HTTP: a crash can strand a queued finding, and history's
queue replay fingerprint does not include the approval or complete request body.
Implement a scoped durable full-selector operation ledger and a shared SQL
transaction that checks replay first, locks the finding, verifies current version
and approval, appends the authorized queue transition, reserves the matching plan
and records an outbox dispatch. Operation reuse with another approval/body must
conflict; exact replay returns the original outcome even after later disposition.
Do not store caller-controlled executable assertions in workflow history.

The dispatcher must reconcile a deterministic Temporal workflow ID before retrying
an ambiguous start. Register the existing reproduction activities only when the
approved registry, snapshot reader and evaluator consumer are configured. Status
must combine durable dispatch/cancellation and verified receipt without exposing
assertion bytes; never-staged cancellation has null receipt and remains unverified.
Cancellation and termination recovery must clean owned children even after parent
loss. These are requirements for the next slice, not claims about this registry.

Decisive c3b acceptance: actual authenticated HTTP + PostgreSQL + Temporal submits
an approved finding, rejects read-token writes/wrong subject/arbitrary execution
controls, handles concurrent duplicates and changed reuse, recovers across each
queue/reservation/outbox/start boundary, cancels before/during staging and after
worker termination, and retains original outcomes after newer finding versions.
Use the existing isolated runner acceptance for real execution; no provider calls
are required. Preserve M1/M2 API baselines and leave public routes unavailable until
this integrated consumer and failure recovery pass. Operator dispositions should
remain a later small slice with their own authenticated evidence registry.

## Prerequisite acceptance

Six unit scenarios cover exact identity, detached ownership, mutation while registry
creation is suspended, malformed selectors and invalid operator plans. A valid
unconfirmed finding receives fresh approval for a retry; old approval is rejected.
The version boundary proves 9998 queues at 9999 and reaches terminal 10000, while
9999 cannot begin another reproduction. One real
PostgreSQL test proves competing expected-version queue transitions admit one winner,
exact queue replay preserves the event, and a stale registry selection is rejected.
It deliberately does not claim atomic plan reservation or HTTP/Temporal acceptance.
