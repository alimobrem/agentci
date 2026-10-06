# Durable model review Check scheduler

Development integration for M3-07d-1; M3 remains unreleased. This scheduler builds
on the [publication slice](m3-model-review-checks.md). It changes only the optional
`agentci/model-review` Check. Existing deterministic/eval Checks keep their paths.

## Enablement and upgrade

Publication defaults off. To enable it, apply migrations through
`013_model_review_publication.sql` in order and set
`AGENTCI_MODEL_REVIEW_CHECKS=true` in the worker's private deployment environment.
Only `true`, `false`, or absence are accepted. The worker uses its existing scoped
GitHub App installation and explicit `AGENTCI_PUBLIC_URL`; the public origin must
serve authenticated `/v1/model-reviews/{id}` reads. No extra App permission or
installation is requested. Development tests use a fake GitHub HTTP service;
live App acceptance is still separate.

Migration013 is required for enabled Checks. The review controller and customer
API can continue through migration012 with Checks disabled. With013 applied,
triggers retain publication work even while the capability is disabled. Re-enable
processes pending work without another review or provider charge. The upgrade
backfills existing admissions once; checksum-verified migration replay does not
reset generation, leases or acknowledgment. Startup checks the required columns
and enabled enqueue/integrity triggers before any publication claim. Preserve
existing volumes; apply upgrades explicitly instead of relying on a fresh-volume
Compose initialization hook.

## Durability and retry behavior

Admission creation, visible dispatch/cancellation/terminal state changes, and
summary insertion enqueue a generation in the same database transaction. Lease
refreshes, duplicate cancellation, repeated admission and unchanged dispatch do
not enqueue another generation. Independent termination recovery updates the
same outbox, so it cannot bypass publication scheduling.

A tick claims at most ten admissions using row locks and five-minute leases.
After the bounded remote operation, acknowledgment advances only the claimed
generation. A newer generation arriving during publication remains pending.
Acknowledgment follows remote success; a lost response or process death leaves
work retryable and reconciles the owned Check identity. Expired lease tokens
cannot acknowledge a replacement claim. Superseded work is acknowledged only
after its permitted cleanup has completed.

Ordinary failures back off exponentially from two seconds, capped at five
minutes. GitHub rate-limit timing uses only allowlisted scalar response metadata,
with at least a minute's cooldown. Timing outside a seven-day future window is
rejected as implausible metadata and falls back to that one-minute delay; it is
not persisted as a practically permanent stall. The later of that timing and ordinary backoff
is retained in PostgreSQL for the deployment; a new admission or fresh worker
process cannot bypass it. Already dispatched network requests cannot be recalled.
No raw SDK error, request, provider response or credential is stored in retry
state. Shared App use outside this deployment is not coordinated by this table.

A tick runs independently alongside workflow dispatch and recovery. Turning off
publication stops new claims without deleting evidence or pending generations.
A failed publication cannot turn execution evidence into a passing review. The
source lock serializes cooperating writers; SQL and GitHub remain separate
systems with the limitations documented in the publication slice.

## Acceptance evidence

Real PostgreSQL and authenticated Octokit/HTTP tests verify lost committed-create
responses, no repeated publication for unchanged evidence, disabled/re-enabled
pending work, new terminal generations during a remote write, and rate-limit
cooldown across a fresh scheduler/client. A real child publisher is killed after
its remote write and before SQL acknowledgment; after advancing its expired
fixture lease, a new scheduler reconciles without a duplicate Check. The real
control HTTP service accepts the resulting status link only with its deployment
evidence credential and returns the exact retained admission/digest.

Migration tests cover existing-row backfill, replay, checksum tamper rejection,
concurrent claims, stale acknowledgment, summary/cancellation/termination enqueue,
no-op transitions, tenant isolation, immutable identity and disabled-trigger
readiness failure. Test-only lease/clock updates avoid waiting five minutes and
do not alter production timing. Live GitHub mutation, account setup, hosted
publication acceptance and phase release remain separate gates.
