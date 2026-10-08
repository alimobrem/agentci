# Authenticated operator dispositions

Development task M3-07c-3g adds `POST /v1/findings/{id}/dispositions` with
the original draft operation `setFindingDisposition`. Apply database migrations
through 020. The scoped operator credential enables this route independently
of reproduction execution configuration. Evidence readers cannot write.

The JSON request contains schemaVersion, reviewId, subject, expectedVersion,
operationId, disposition, reason and evidenceDigest. Only `false-positive` and
`resolved` are accepted. The request is limited to 8 KiB and the nonblank reason
to 4 KiB of UTF-8. Unknown fields, actor/receipt inputs, confirmation, query
parameters and detached review/finding identities are rejected.

The control service checks the original retained review and finding association,
then creates an operator attestation with `assertionDigest:null`. It retains the
immutable request/receipt and lifecycle event in one bounded SQL transaction.
An operator's evidence digest is an attestation reference; it does not certify
successful reproduction. Confirmation still requires trusted reproduction evidence.

Operation and finding locks serialize concurrent requests. Exact retries return
the original event, including after restart or subsequent resolution. Changed
inputs conflict, stale versions conflict and invalid lifecycle transitions fail.
Receipt/event failures roll back together. Responses redact storage errors.
The trusted receipt reader checks retained subject, request, receipt and event
identities, including operation ID, and rejects rehashed substitutions.

Use `client.setFindingDisposition(originalAdmission, findingId, request)` or
`agentci finding disposition --request ADMISSION_JSON --id SHA256_ID
--disposition DISPOSITION_JSON`. Preserve the operation ID and original input
after ambiguous response loss. The client requires an operator token before
network I/O, checks the original admission and verifies the response's complete
event/action/receipt identity. The CLI rejects FIFO, symlink and oversized files
with structured exit-2 errors.

This local slice does not close M3-07, customer GitHub flows, physical isolation,
exact-source hosted CI, UI, publication or milestone release gates. Those retain
their original acceptance requirements. Only inaccessible external model-provider
validation may remain explicitly deferred under the owner-approved exception.
