# Reproduction dispatch persistence prerequisite

M3-07c-3d-2a adds migration 017 and an internal scoped dispatch store. It does not activate a route, workflow, runner, or consumer. Full c3 runtime acceptance and milestone release remain open.

Immutable c3b operation/plan/subject lineage anchors each state row. The immutable dispatch binding names the new `reproduceAdmittedFinding` workflow, scoped workflow ID, and controller/evaluator queues. Legacy `reproduceFinding` histories are unchanged. The future consumer must use the existing scoped identity helpers for children as well.

Configuration identity belongs to immutable lease-attempt records. A fresh lease can bind an unchanged enabled plan under a newer active configuration; a lease cannot change its own authority snapshot. Binding checks the active pointer under a share lock and refuses revoked plans. These checks are persistence integrity, not a substitute for the final live permission/expiry checks in the authority transaction. Historical reads validate retained configuration lineage without claiming it remains authorized.

An acknowledged run retains its original attempt and start memo forever. Recovery uses that identity, then independently rechecks current authority. Before a new start or rebinding, the future consumer must reconcile ambiguous prior starts against the bounded attempt history, exact workflow type/queue/subject/memo and actual run ID. Temporal calls stay outside SQL; SQL and Temporal are not atomic. Acknowledgement records trusted internal observations, not independently verified Temporal evidence.

Lease claims use row locking and fresh database-clock fences after lock acquisition and before mutations. Expired controllers cannot acknowledge, renew or release. Retry cooldown survives restart. Cancellation retains its first cause and remains recoverable even before binding; recording cancellation does not prove a remote run stopped. Permission outages retry; denial cannot be relabelled input-limit.

There is intentionally no completion API. The runtime follow-up must reconstruct the actual immutable receipt and history binding before recording completion, preserve completed receipts through cancellation races, and distinguish executed error from confirmed finding and non-execution proof. This store cannot mark a finding confirmed or synthesize a receipt.

Migration 017 idempotently backfills existing intents. Consumers must invoke scoped backfill for newly reserved intents until transaction-integrated enqueue is added. Readiness requires both new tables. Attempt pages contain at most 100 records with exclusive token continuation; callers must reconcile through exhaustion. No public API or evaluator role grants are added.

Local acceptance covers concurrent controllers, exact acknowledgement replay, changed identities, expiry and lock-wait expiry, cancellation, cross-scope access, config advancement/tombstones, SQL immutability, corrupted lineage, durable cooldown, checksum rejection, transaction failure and actual backend termination. Hosted CI, packaged deployment and live consumer recovery are separate gates.
