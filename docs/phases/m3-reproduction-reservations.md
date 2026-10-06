# M3-07c-3b atomic reproduction reservation

Internal development storage, dependent on the approved immutable registry. There
is no HTTP endpoint, production consumer registration or dispatched workflow in
this slice. Apply the new checksummed migration
`014_m3_reproduction_reservations.sql` after existing finding, reproduction and
review-admission migrations. Applying the same migration again is safe; changing
its applied checksum is rejected. Existing migrations and API baselines are intact.

`ReproductionReservations.reserve(findingId, selector)` consumes the strict c3a
selector and authenticates its registry selection against the retained finding.
The caller remains responsible for authentication/authorization on every call.
The complete selector and route finding ID bind operation replay. Exact retries
return the original reservation after later finding dispositions; changing approval,
subject, expected version or request fields under the operation ID conflicts.
Registry authority is consulted again on replay against the original retained
version. No supplied digest alone authorizes work.

One SQL transaction serializes the scoped operation and finding, validates the
bounded immutable history chain, checks the exact admitted review and deterministic
review-finding association, and verifies any retained summary reference. It then
appends the approved queue event, reserves the exact plan, records the full-selector
operation/result, and writes an immutable dispatch intent. All four writes commit
or roll back together. Existing finding/plan limits apply. History's original queue
fingerprint remains compatible; the additional operation ledger binds the selector
without changing released event semantics. Plan attempt limits and unique finding
version constraints remain enforced.

A replay verifies the plan, queued event, operation receipt and dispatch intent;
it cannot turn a missing or corrupted retained component into success. The intent
contains a deterministic workflow ID but does not assert that Temporal started it.
Immutable intent storage is deliberately separate from future mutable dispatcher
leases, attempts and terminal state. Registry replacement/revocation and approval
lifetime rules still need explicit consumer-boundary handling before live dispatch.

Transactions use scoped advisory locks, five-second lock and ten-second statement
limits and a fifteen-second PostgreSQL transaction timeout. A lost checked-out
connection is marked broken and removed from the pool; transaction-scoped error
handling prevents a backend death from escaping as an unhandled client error.
Errors returned to callers are bounded and omit database diagnostics.

## Acceptance and remaining work

Thirteen real PostgreSQL scenarios cover concurrent identical requests, competing
versions, the same operation selecting different authorized approvals, replay after
a later disposition and reopened connection, wrong scope/admission association,
corrupt admission evidence, and immutable records. Injected failures at each of the
four inserts leave only the original finding. Actual termination of the owned
transaction backend after plan insertion also rolls back everything; retry through
a fresh connection commits once. The database service itself is not stopped. Corrupted retained plans, operation
results and dispatch identities fail replay even when the fixture recomputes their
digests. Identical migration reinstall preserves work; changed source and applied
checksum mismatches are rejected. Immutability bypass is confined to owned test
schemas and is never used by the production writer.

These tests use synthetic retained reviewer observations and trusted fixture
assertions; they invoke no provider and execute no reproduction container. They do
not substitute for real HTTP/PostgreSQL/Temporal and isolated evaluator acceptance
required by the parent M3-07c-3 task. That task is now in progress after c2 acceptance.

Next: define mutable dispatch leases/reconciliation and cancellation status, register
the configured consumer, and test ambiguous Temporal starts, worker death, terminal
recovery and cancellation before/during staging. Only then expose the approved
submission/read/cancel transport with operator permission, exact subject/version,
review membership, consumer readiness and fresh authority checks. Operator evidence
dispositions remain a separate slice. M3 release and UI gates remain open.
