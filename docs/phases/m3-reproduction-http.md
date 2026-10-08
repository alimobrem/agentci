# M3 reproduction status and cancellation transport

Development slice M3-07c-3e-2 exposes retained status and durable cancellation for
already-reserved finding reproductions. Public admission, disposition mutation,
executable reproduction clients, customer demonstrations and M3 release remain
separate unfinished work. The consumer/configuration introduced in PR #68 and the
response contracts in PR #69 are prerequisites; no milestone gate is passed by
this slice.

Apply migrations through 018 before using these operations. The existing control
service constructs the scoped reader independently of new-admission configuration.
An absent migration or unavailable/corrupt retained dependency returns a bounded
503; it does not become an empty successful result. No App or provider access is
needed to read or cancel already-retained operations.

`GET /v1/finding-reproductions/{id}?reviewId=UUID` accepts the scoped evidence or
operator bearer credential. The review association is mandatory even within one
repository; another review or tenant returns 404. Unknown/repeated query fields
are rejected. Status is read in one bounded PostgreSQL repeatable-read snapshot.
The reader verifies admission identity, deterministic finding association, the
complete bounded finding history, queued finding, reservation/dispatch lineage,
retained receipt or non-execution proof, and settlement event/digests.

The response reuses `FindingReproductionStatus`. `queued`, `bound` and
`dispatched` distinguish durable intent, retained binding and acknowledged run.
`settled` requires the consumer's verified cleanup/settlement record and its
authenticated retained evidence. None means that the assertion passed. A receipt
may exist before settlement; its presence alone does not prove cleanup. Error and
negative execution stay unconfirmed; never-staged proof stays `verified:false`
with a null receipt. Supersession preserves original evidence. The queued finding
reference remains historical; current finding/history are separate reads.

The settlement's `evidenceDigest` follows the persisted consumer convention:
the canonical receipt digest for `receipt-retained`, canonical proof digest for
`never-staged`, and the operator receipt's authorized evidence digest for
`superseded`. It differs from a reproduction receipt's inner execution evidence
digest. The response validator and frozen fixtures now preserve that distinction.

`POST /v1/finding-reproductions/{id}/cancellation` requires the separate operator
credential, an empty body and no query parameters. Reader-only requests receive
403. A successful 202 is exactly `{schemaVersion:"v1alpha1",id,cancelRequested:true}`.
It records monotonic cancellation in the existing dispatch store for independent
recovery; no workflow RPC is attempted by the HTTP handler. Repeats survive control
restart, and cancellation remains available after approval revocation or admission
configuration removal. Late cancellation preserves retained receipt/settlement.
The acknowledgment is not a claim that physical work has stopped.

Responses are private `no-store` JSON with `nosniff`; errors contain only stable
codes. Mutation bodies are bounded to 4 KiB and must be empty. Status payloads
are bounded to 4 MiB; history to 10,000 events/32 MiB with bounded batches and a
cumulative 10-second database read budget. Nonsettled polling and transient 503
responses include `Retry-After: 1`. The released M1/M2 contracts are unchanged.

Real HTTP/PostgreSQL regression scenarios live in
`tests/integration/reproduction-http.test.ts`. Package smoke repeats them against
the installed production control modules, using the source test loader solely as
the harness. The installed package itself must contain no development loader.
Existing consumer tests retain Temporal and physical-isolation acceptance; fixture
settlement readers in the HTTP tests do not substitute for those gates. Container,
hosted exact-source verification and independent review must be recorded before
claiming slice acceptance.
