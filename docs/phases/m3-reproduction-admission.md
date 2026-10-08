# Operator-authorized reproduction reservation

Development task M3-07c-3f adds `POST /v1/findings/{id}/reproductions`.
It accepts a scoped operator credential and `FindingReproductionRequest` JSON
(maximum 4 KiB): schemaVersion, reviewId, subject, expectedVersion, operationId,
approvalId and approvalDigest. Unknown fields, query parameters, commands, images,
budgets, URLs and request-supplied receipts are rejected. Evidence readers cannot
reserve. The original review, finding and complete approved plan must match.

Opt in with the existing pinned reproduction catalog/config environment and an
independent cursor key. Apply authority through the existing operator command;
startup and HTTP calls never install or broaden it. Configure the worker's
reproduction consumer with the same applied authority and catalog. Apply database
migrations through 019. Without admission configuration the route fails closed;
existing status and cancellation remain separately available.

Before mutation, the control service reconstructs the registry from the exact
historical finding, operator catalog and verified base/head Git snapshots. Snapshot
requests share a 10-second abort signal and do not progress to SQL after expiry.
Applied revision, enablement/revocation, approval expiry, repository installation
and exact open PR/base/head permission are checked within the bounded authority
transaction, before and after reservation writes. Losing permission after writes
rolls back the finding event, plan, operation, intent and initial dispatch state.
The HTTP handler never starts Temporal workflows or evaluator jobs.

A 202 returns `FindingReproductionAccepted` and a status Location. It records
durable intent, not execution, confirmation or cleanup. Preserve the complete
reference. `reserveReproduction(originalAdmission, findingId, request)` and
`agentci finding reserve-reproduction --request ADMISSION_JSON --id SHA256_ID
--reservation RESERVATION_JSON` verify original admission, selector digest and
response identity. Operator authorization is required before network I/O. Retries
retain the same selector/operation ID, including after an ambiguous response loss.
Changed inputs or stale versions conflict. An unavailable response does not prove
that a prior ambiguous write failed; replay the original operation.

Private no-store responses expose bounded stable errors only. FIFO/symlink or
oversized input files fail with structured exit-2 errors. Existing read/status/
cancellation commands and immutable M1/M2 compatibility baselines remain intact.

This slice does not expose disposition mutations. Those require a production
controller-owned authenticated operator-receipt store/reader before lifecycle
transitions can be served. Installed package, hosted physical isolation, exact-
source CI, independent evidence acceptance, customer flows, UI and all M3 release
gates remain distinct requirements. Live external-provider validation alone may
remain explicitly deferred under the approved exception.
