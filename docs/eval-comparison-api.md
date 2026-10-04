# Eval comparison evidence API

M2 candidate interface: `GET /v1/eval-comparisons/{id}`. The ID is the durable
comparison job UUID. This read is additive to released M1 semantic evidence;
it does not change or rewrite `/v1/evidence/{id}` or prior review digests.

Send the deployment evidence bearer token over HTTPS. Authentication precedes
UUID validation or storage lookup. The deployment's repository and organization
scope constrain access; an unknown or out-of-scope job returns 404. The response
contains `{id, digest, comparison}` with EvalComparison v1alpha1 and normalized
planned units/results. It contains no projected source, command argv, lease tokens,
App keys or database credentials. See [OpenAPI](../specs/api/openapi.json) and the
[shared synthetic fixture](../specs/api/fixtures/eval-comparison.json).

UUID spellings are case-insensitive for comparison IDs and caller-supplied
organization, review and attempt identities. Storage returns its canonical
resource ID; the same completed snapshot has identical evidence/digests and
export frames for uppercase and lowercase request spellings. The client validates
the original payload and hashes before comparing expected identities; it does
not rewrite signed data. Different UUIDs, repositories and commit identities
still fail scope/identity validation. This correction does not change the M1
wire contract or compatibility baseline.

Each read uses a consistent database snapshot. The digest binds that exact
snapshot, including its source identity and derived summary. Pending/running
execution or cancellation can change the snapshot digest. Completed unit results
remain immutable; a digest does not mean a running job is finished. Client
validation recomputes the summary and checks planned trial thresholds, provenance,
record digest and all caller-supplied identities. Behavioral regressions remain
separate from evaluator errors, insufficient trials and missing coverage.

```ts
import { AgentCIClient } from 'agentci/client';
const client = new AgentCIClient({
  url: process.env.AGENTCI_URL!,
  token: process.env.AGENTCI_EVIDENCE_TOKEN!,
});
const record = await client.evalComparison(comparisonId, {
  organizationId, repository, pullRequest, baseSha, headSha, reviewId, attemptId,
});
console.log(record.comparison.summary);
```

Use trusted webhook/review identities for the expected values, rather than copying
them from an unverified response. Redirects are rejected. The client has a bounded
request deadline and 4 MiB response budget; it sanitizes transport/server errors.
The server also refuses oversized comparison records with explicit 413 rather than
truncating results. Larger records use the snapshot export described below. Capacity acceptance has
prior CI evidence; the subsequent UUID correction passed source- and artifact-verified CI
37202994401: 123 unit/API/domain tests and fourteen native groups, zero skips.
Comparison API acceptance is restored; the Check and [CI proof](../releases/m2-uuid-case-ci.json)
cover the exact corrected source. Native, installed-client and actual
customer candidate checks are recorded in [the UUID proof](../releases/m2-uuid-case-local.json);
they do not substitute for release/download acceptance.

| HTTP status | Error code | Meaning |
| --- | --- | --- |
| 400 | invalid-comparison-id | Authorized caller supplied a malformed UUID |
| 401 | unauthorized | Missing or invalid bearer token |
| 404 | not-found | No job in this deployment's scope |
| 405 | method-not-allowed | Only GET is supported; Allow is GET |
| 413 | comparison-too-large | Entire response exceeds 4 MiB; no partial evidence returned |
| 503 | service-unavailable | Storage unavailable, missing schema or evidence-integrity failure |

Successful and error responses use JSON, Cache-Control: no-store and
X-Content-Type-Options: nosniff. Errors do not return private database/provider
messages. The installed client reports typed AgentCIError codes; local response
validation failures use invalid-comparison and expected-identity failures use
identity-mismatch. Server/client size failures use response-too-large in the client.

GET is read-only and can be retried after transient failure. There is no mutation,
request body, filtering or ordering parameter on this single-resource operation.
The operation does not start reviews, cancel jobs or imply PR publication.

Fresh M2 Compose databases apply the bundled migrations during initialization.
For an existing deployment, back up its database and apply the additive,
checksum-bound `deploy/migrations/002_m2.sql` before starting M2 services. For the
bundled Compose deployment:

```sh
docker compose --env-file .env -f deploy/compose.yaml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U agentci -d agentci < deploy/migrations/002_m2.sql
```

API startup/readiness checks require the M2 jobs, units and trial tables. A
restricted evaluator uses its separate role setup; this read does not grant the
API's credentials or privileges to eval child containers. PR staging/publication,
customer deployment and released-build acceptance remain separate M2 gates.


## Snapshot export

`GET /v1/eval-comparisons/{id}/export` uses the same bearer and scope rules.
It returns `application/x-ndjson`: LF-delimited JSON frames following
[the frame schema](../packages/evals/json/eval-export-frame.schema.json) and
[shared synthetic wire fixture](../specs/api/fixtures/eval-comparison-export.ndjson).
The ordered stream contains a header, grouped planned units/results and derived
comparisons, a summary, and a terminal end frame. Sequence numbers and a SHA256
hash chain bind every frame. The header identifies the exact scoped storage
snapshot; an export is not the inline record's canonical digest format.

```ts
for await (const item of client.evalComparisonExport(comparisonId, expectedIdentity)) {
  if (item.type === 'unit') consumeNormalizedRun(item.data);
  if (item.type === 'comparison') consumeBehavioralDelta(item.data);
  if (item.type === 'summary') acceptCompletedTraversal(item.data);
}
```

The client verifies each frame, exact expected identity, planned result thresholds,
comparison deltas and summary/counts. It exposes the summary only after the terminal
frame and EOF are verified. Earlier items are provisional: a failed traversal
must not be accepted as complete evidence. Consumers should process items rather
than retain every run in memory. The client/server retain one baseline/head group,
bounded identity/gap metadata and one frame, rather than the entire response.
Each frame is limited to 64 MiB; stored plan/input/result bounds limit individual
frames while the overall export may exceed the inline 4 MiB response limit.

One repeatable-read database transaction covers the stream. Concurrent execution
or cancellation cannot mix new state into it. The captured snapshot may become
older than the live job while remaining consistent. There is no resume cursor or
partial retry: after transport-failure, incomplete-export, invalid-export or caller
cancellation, discard provisional acceptance and restart the entire GET to obtain
a fresh snapshot. A new snapshot can have a different header snapshot digest.
Redirects, reordered/duplicate/truncated/forged frames and trailing data fail.

The request deadline is at most 120 seconds; `evalComparisonExport` accepts an
optional `{signal, timeoutMs}` third argument. Leaving iteration cancels the reader.
Disconnect, timeout and abandonment roll back the database transaction and release
its connection. At most two exports run concurrently per API process; overload
returns sanitized 503 with Retry-After: 1. A slow client is bounded by write
backpressure and a 30-second idle-transaction timeout. Errors after stream headers
terminate the connection; HTTP 200 alone never certifies a complete export.

The agent client and controller Check publisher share `EvalExportVerifier` for
frame hashes, identity, planned result semantics, derived deltas, final summary
and terminal digest validation. Both require complete traversal through EOF.
Refactoring this verifier does not change the export wire contract or the
client’s public methods/error codes.

The released M1 static `Analysis` representation remains immutable to preserve
stored digests and client compatibility. Its `evals` field describes the static
analysis operation. Retrieve behavioral execution state, outcomes and deltas from
the separate `EvalComparison` resource linked by `agentci/evals`; the full M2
workflow publishes both semantic and behavioral Checks.
