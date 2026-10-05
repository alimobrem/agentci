# M3 provider budget accounting (implementation in progress)

The provider core uses a PostgreSQL ledger with an explicitly configured immutable
budget ID, organization, repository and integer USD-micro limit. These are trusted
operator inputs; model output must never select or enlarge its own budget.
Migration `004_m3_model_budget.sql` adds the ledger without changing historical
migration checksums. Existing deployments must apply it before using this core.
Fresh Compose databases apply the migration directory automatically.

A transaction locks the budget row before summing actual settled costs and all
reserved or unknown costs. Each dispatch must reserve a conservative positive
upper bound with a pricing revision. Concurrent reservations cannot exceed the
remaining limit. No estimate means no budgeted dispatch. The invoke executor reserves each explicit retry separately. Adapters must disable
internal retries so one invocation always means one outbound attempt.

Request IDs and attempt numbers are unique within a budget. Reusing a request ID
with different normalized request bytes is rejected. Replaying an existing attempt
never authorizes another outbound call. A process crash after reservation leaves
funds held: absence of a response is not evidence of no charge. A known not-sent
attempt may release its reservation; an ambiguous attempt retains the upper bound
until authoritative cost reconciliation. Unknown accounting is not zero.

Settlements are idempotent only for the same actual amount. Actual costs above the
estimate are recorded in full, so a provider overrun cannot disappear through
clamping. Such an overrun can exceed the configured limit after dispatch; subsequent
reservations fail. Strict pre-dispatch bounds therefore also depend on correct
provider token limits and conservative pricing estimates, which adapter acceptance
must verify. Reconciliation is a trusted operation, never model-authored data.

`tests/integration/model-budget.test.ts` requires PostgreSQL and verifies concurrent
reservation limits, reconstructed-store recovery, replay rejection, scope mismatch,
immutable terminal accounting and overrun retention. Local acceptance used the
project's pinned PostgreSQL 18.6 image. The invoke executor is connected to the ledger; streaming integration and full
provider-core acceptance remain unfinished.

`invokeModel` validates the request and capabilities before reserving. A deadline
or caller cancellation aborts the provider signal and bounds how long invocation
waits, even if an adapter ignores that signal. This cannot guarantee a remote
provider stopped billing; possibly sent work retains its reservation. Cancellation
during database reservation waits for its outcome and releases funds without
provider dispatch. Database operations have statement and lock timeouts.

Only explicitly retryable transport or rate-limit failures retry, within the
request attempt and deadline limits. Raw errors and malformed responses do not
implicitly retry. Every response is bound to its request and attempt and validated
before returning. Failure to persist accounting fails the invocation as ambiguous.
Estimated costs retain the conservative reservation; only reported costs settle.
The execution tests cover retry limits, redaction, cancellation, an uncooperative
provider, budget exhaustion and accounting failures. These are fixture tests;
live provider billing and adapter behavior still require their own acceptance.
