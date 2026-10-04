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
truncating results. Large-result pagination/export remains an API capacity item to
resolve before M2 release acceptance; this checkpoint does not certify it.

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
