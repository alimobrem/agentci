# Customer model-review API development slice

M3-07c-1 implements four opt-in control operations. This is development source,
not an M3 release. M3-07c-2A adds finding/history reads; export, reproduction and the dashboard remain later dependent slices. The shared contract is [the reviewed transport design](m3-customer-api-contract.md).

| Operation | Purpose |
| --- | --- |
| `GET /v1/reviewer-profiles` | Safe configured ID/revision/mode/revocation descriptors |
| `POST /v1/model-reviews` | Exact-subject, operator-profile admission; request UUID is its replay key |
| `GET /v1/model-reviews/{id}` | Coherent retained admission, execution disposition and summary |
| `POST /v1/model-reviews/{id}/cancellation` | Empty body; monotonic durable cancellation intent |

Use the existing scoped App, PostgreSQL migrations through 012 and Temporal worker.
Set an independent private `AGENTCI_OPERATOR_TOKEN` (at least 32 characters, no
CR/LF, distinct from `AGENTCI_EVIDENCE_TOKEN`) for mutation and new-resource reads.
The evidence token remains read-only. Released evidence/eval routes still require
the evidence token. Never put either token on CLI arguments or in URLs/logs.

The control process reads the same immutable reviewer definition as the worker
and verifies new admissions using the approved repository-scoped GitHub App.
It constructs no provider clients and requires no OpenAI/Anthropic/xAI keys.
Worker startup registers allowed profiles and performs provider execution. Profile
presence or a queued admission does not certify a live worker. Offline workers
can resume durably queued work. Missing profiles or unavailable authorization fail
with a bounded 503; revoked or stale subjects are denied without new dispatch.

The development overlay mounts the config and existing App key read-only into API
and worker. API provider-key environment values are deliberately empty. Put provider
keys only in worker configuration; keep all private files outside source control.
After applying migrations to an existing database, use the documented local setup:

```sh
export AGENTCI_REVIEWER_CONFIG_FILE="$PWD/deploy/reviewers.synthetic.example.json"
docker compose --env-file .env -f deploy/compose.yaml -f deploy/reviewer.compose.yaml up -d --build api worker
```

Supply the operator token in private `.env` used by Compose; never print rendered
Compose configuration because it contains secrets. Preserve database volumes.
Production deployments should use their existing secret manager and service
identities; this local overlay does not add hosting or multi-tenant acceptance.

Without reviewer configuration, discovery returns `{schemaVersion:"v1alpha1",
profiles:[]}` and admissions return 503. Stored status and authenticated cancellation
remain available with the operator token even when new admissions are disabled.
Legacy `/readyz` keeps its released base-service meaning; it does not claim a live
model consumer or provider readiness. Configured startup probes required migrations
before accepting work; mismatched/missing runtime dependencies fail startup.

202 means admitted or cancellation intent retained, never a passing review. Exact
retries return the original admission even after the head changes; a new request
ID must pass current authorization. Status reads use one SQL snapshot. Completed
execution can contain refused roles and incomplete selected coverage. Summary
absence is unknown coverage; synthetic results are not live-provider evidence.
No Temporal execution IDs, private failures or provider continuation material are
serialized in these responses. Clients verify exact identity and canonical hashes.

Verification covers actual HTTP request/response schemas, credential separation,
malformed UTF-8, unknown fields, early rejection of an unfinished oversized upload,
redacted failures and disabled admission. Real PostgreSQL/Temporal acceptance
covers concurrent replay, one outbox row, exact-head authorization, cross-scope
reads, queued/offline behavior, seven synthetic roles, coherent reads during
finalization, retained restart status, revocation and cancellation without extra
provider attempts. A separate real PostgreSQL test launches the compiled control
entry point with a generated fixture App key, no provider keys and blocked external
fetch. It verifies configured profiles/status, disabled legacy startup and rejection
of missing migrations or missing/equal operator credentials before listening.
Packaged client/service and release gates remain additional.

## Retained findings and history (M3-07c-2A)

Set `AGENTCI_CURSOR_KEY` to an independent private random signing secret of at
least 32 characters without CR/LF, distinct from both bearer tokens. Supply it
through the private environment or secret manager; never put it in a URL or CLI
argument. The development Compose overlay forwards it only to the API. Without
this key the new finding read routes return 503; original service startup and
review routes remain available. Rotating the key invalidates existing cursors.

- `GET /v1/model-reviews/{id}/findings?limit=25` returns the original summary's
  `{id,version,digest}` references. Later dispositions never replace them.
  No retained complete summary returns 409, not a clean empty result.
- `GET /v1/findings/{id}?reviewId=UUID` returns the current retained history record;
  add `version=N` to select an immutable earlier version. The digest in an
  original review reference is therefore distinct from a later current record.
- `GET /v1/findings/{id}/history?reviewId=UUID&limit=25` returns ascending events,
  a fixed `throughVersion` watermark, and an opaque `nextCursor` or null. Pass that
  cursor unchanged with the same review/finding route. Every page authenticates.

Read and operator tokens can use these routes. Findings associate with an exact
review through the controller's deterministic ingestion operation ID and exact
subject, never merely the PR number. Current/version/history reads also work for
partial failed/cancelled reviews with retained findings; a summary is not invented.

Pages contain at most 100 items and 4 MiB; byte bounds can shorten them. Cursors
expire after 15 minutes and bind scope, route, review/finding identity, immutable
summary or history watermark, position and authenticated predecessor digest.
Newly appended events appear only in a fresh traversal. Unknown/repeated query
parameters, changed scope/filter, invalid or expired cursors fail with bounded
400 errors. Expiry or key rotation requires a new traversal; do not concatenate
it to an older traversal as one certified history.

The first/current/version read reconstructs the prefix using bounded SQL batches;
history continuations validate the signed predecessor then replay only the next
page. The existing storage bounds remain 10,000 events and 32 MiB per finding.
Every SQL statement consumes one cumulative 10-second read budget. Storage delay
or budget exhaustion returns a redacted 503; this bound is not a guarantee that
the largest history can be served within 10 seconds on every deployment. An
individual record that cannot fit a response returns 413, never silent omission.
Readers release the consistent database snapshot before writing the JSON response.

M3-07c-2B remains required: bounded snapshot export must include retained partial
roles/findings, honest missing-role coverage and a mandatory verified end frame.
No export route is advertised by this read-only slice.
