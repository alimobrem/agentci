# Customer model-review API development slice

M3-07c-1 implements four opt-in control operations. This is development source,
not an M3 release; finding/history/export, reproduction and the dashboard remain
later slices. The shared contract is [the reviewed transport design](m3-customer-api-contract.md).

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
