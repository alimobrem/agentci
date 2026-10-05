# M3-06b durable finding history

Development implementation; acceptance remains in progress. This slice adds the
internal FindingHistoryStore, not customer endpoints or an M3 release.

A finding starts as a deduplicated record reconstructed from controller-authenticated
reviewer results and their exact context. The store compares that reconstruction
against the proposed initial value before writing. Callers provide trusted scoped
readers backed by retained evidence; models cannot provide these functions or
receipt maps. Model claims and hash strings alone do not authorize a write.

Migration 006 adds tenant/repository-scoped append-only events. Each event retains
its operation ID, input digest, action, receipt, resulting finding and preceding
event digest. Reads validate the chain and replay legal transitions to reconstruct
state. PostgreSQL uniqueness on finding/version prevents competing updates from
both succeeding. Repeatable-read transactions preserve a consistent history;
serialization conflicts are explicit retryable conflicts, not successful writes.
An exact retry with the same operation ID returns the original retained result,
even after later transitions, without repeating external evidence reads. Reusing
an operation ID with different input fails.

UPDATE and DELETE triggers reject rewriting existing events. Deployment database
administrators can still alter database permissions or schema; this is not a
cryptographic defense against a privileged administrator. Reads and writes are
bounded to 10,000 events and 32 MiB of JSON per finding, with database statement/lock timeouts. Size is checked before loading the history into application memory. There
is no automatic history truncation. Reader implementations must bound their own
I/O and authenticate evidence; isolated reproduction receipts remain M3-06c.

The real PostgreSQL acceptance covers repeated migration application, authentic
proposal reconstruction, concurrent creates and updates, retry idempotency,
connection restart reads, cross-tenant and wrong-subject rejection, unavailable
and wrong-finding receipts, failure rollback, database outage redaction and
update/delete rejection. The package smoke checks the installed migration and
module. Operation coverage is in specs/api/finding-operations.json.
