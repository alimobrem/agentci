# M3 customer model-review transport: draft 1

Status: parent-reviewed draft for M3-07c-0 implementation; not shipped. No routes or client
methods in this document are available yet. The shipped OpenAPI, operation map,
M1/M2 baselines and released `agentci review` command remain unchanged. The
[operation map](../../specs/api/drafts/model-review-transport.json) and
[examples](../../specs/api/drafts/model-review-examples.json) are shared inputs to
the server, client and Checks PRs. Examples describe contracts, not execution proof.

## Identity and authority

Use `/v1/model-reviews` for model admissions, distinct from deterministic analysis
and eval reviews. Reuse `ReviewAdmissionRequest` and `validateReviewAdmission`
unchanged: exact organization/repository/PR/base/head, request UUID, immutable
profile ID/revision and synthetic/live mode. Canonical normalization/digests use
`packages/review/engine.ts`. UUID inputs normalize to lowercase; Git SHAs stay
exact lowercase 40-character values. Base and head must differ.

The configured single-repository service is the authority for organization and
repository. A body or query cannot change that scope. Authenticate before object
lookup; wrong-scope objects return the same 404 as absent objects. A valid
mutation against a disallowed profile/mode or stale GitHub subject returns 403
`review-denied`. Authorization storage/GitHub failure returns 503, never permission.
Do not claim multi-tenant hosting from this scoped deployment.

| Credential | New reads | New mutations |
| --- | --- | --- |
| `AGENTCI_EVIDENCE_TOKEN` | Yes | 403 `forbidden` |
| New `AGENTCI_OPERATOR_TOKEN` | Yes, for new resources | Yes, subject to operation policy |
| Missing/unrecognized | 401 `unauthorized` | 401 `unauthorized` |

Both are independent bearer credentials, at least 32 characters, without CR/LF;
configuration rejects equal values. Operator authority includes reads of the new
model-review/finding resources so agents can submit and poll with one credential.
Existing released evidence/eval routes retain their evidence-token behavior. The
read token never gains mutation authority. The operator token is optional while
new mutations are disabled; enabling mutations requires it and consumer
configuration whose required storage/migrations are ready. An offline worker
may leave admitted work queued: configuration/profile presence is not proof of a
live worker or provider readiness. Missing/disabled review runtime returns 503
`service-unavailable` on admission without creating an outbox row; the service
readiness response must not advertise model-review availability from profiles
alone. Current control startup uses `runtimeConfig(false)` and cannot verify
GitHub subjects yet: 07c-1 must supply the approved repository-scoped App reader
through an explicit control-side authorization dependency. Do not bypass that
check or broaden the App installation. Credentials belong in private
environment/file configuration,
not request bodies, URLs, CLI arguments, cursors or evidence. Authenticate every
request, including retries and every streamed export. No cookies or CORS grants
are added by these service endpoints; dashboard session mediation is later work.

## Admission, retry and status

`POST /v1/model-reviews` accepts exactly the existing admission request (4 KiB raw
UTF-8 JSON maximum). Its `id` is the required idempotency key; a second competing
header key is not supported. New and exact repeat submissions return 202 with
`{schemaVersion,id,requestDigest}` and `Location: /v1/model-reviews/{id}`. This
means durably admitted, including on replay after execution finishes. Read status
separately. Reusing an ID for different normalized content returns 409
`idempotency-conflict`. Transport authentication/scope checks precede replay;
an exact replay returns original admission, without a new current-head grant or
spend. New admissions verify current open PR/base/head and permitted profile;
execution rechecks revocation/authority before provider dispatch.

ID scope is configured organization/repository plus resource/operation namespace.
Retain admitted IDs for the lifetime of retained evidence; no automatic expiry
or reuse in M3. Ambiguous failures retry the identical body and ID. A deliberate
rerun needs a fresh ID. Client timeouts do not cancel work.

`GET /v1/model-reviews/{id}` returns `{schemaVersion,admission,execution,summary}`:

- `admission: {request,digest}` uses the authoritative normalized request; digest
  is SHA-256 of its canonical bytes. Do not expose internal approval payloads.
- `execution: {state,cancelRequested,terminalDigest}`. States are `queued`,
  `dispatched`, `completed`, `failed`, `cancelled`, `terminated`, `timed-out`.
  A bound run ID or dispatch acknowledgment means dispatched; neither proves a
  provider is running. Otherwise nonterminal means queued. No invented timestamps
  or progress percentage. Terminal status has priority over dispatch metadata.
- `summary` is null until retained, or `{summary,digest}` using
  `validateReviewExecutionSummary`. No second coverage schema. A summary may be
  present before terminal finalization; `completed` requires one and its digest
  must equal `terminalDigest`. Other terminal states must have no complete
  summary. `terminalDigest` is null for nonterminal state.

A complete summary can include refused/incomplete roles. Its configured/completed
counts and `wholeRepository:false` describe selected coverage, not success or a
clean repository. Review mode is synthetic/live; reviewer/finding domain mode
remains synthetic/external. Map `live` to `external` explicitly, never relabel
stored domain evidence. Finding verification state and GitHub Check conclusion
are separate from review execution state. No summary means unknown coverage,
not zero configured roles or no defects. Read all status components coherently
in one database snapshot; concurrent terminal/summary commitment cannot yield a
contradictory response.

`POST /v1/model-reviews/{id}/cancellation` has an empty body and returns 202
`{schemaVersion,id,cancelRequested:true}` after durable intent is stored.
Cancellation is a monotonic, naturally idempotent subresource keyed by review ID;
no new operation UUID is necessary. Repeats are safe. Late cancellation cannot
change terminal evidence; the acknowledgment is not a claim that execution was
stopped or that remote charges were refunded. Cancellation remains available
while new admissions are disabled if authenticated storage is available.

## Findings, versions and reproduction

`GET /v1/model-reviews/{id}/findings` lists the finding event references pinned by
the complete summary, sorted lexicographically by finding ID. It returns
`{schemaVersion,reviewId,summaryDigest,items,nextCursor}` where each item is
`{id,version,digest}` for the exact retained event. This view does not silently
replace original review evidence with later dispositions. No complete summary
returns 409 `review-not-complete`; an empty complete result returns empty items.
Use `GET /v1/findings/{id}?reviewId=UUID` for current authenticated finding/event,
or add `version=N` to retrieve an immutable historical event. `reviewId` is
required and must link the finding to that exact review subject, not merely the
same tenant. Responses reuse `FindingHistoryRecord` (including event digest).

`GET /v1/findings/{id}/history?reviewId=UUID` returns events in ascending version
order. First page captures `throughVersion`; subsequent pages keep that immutable
high watermark. New evidence/dispositions are visible only in a new traversal.
All pagination defaults to 25 items, max 100; byte limits may shorten a page, but
must preserve continuation without omission/duplication. Cursor is opaque bounded
base64url (max 2048 characters), authenticated by an operator-owned signing key
independent of bearer credentials, bound to route, scope, review ID, finding ID
where applicable, immutable summary digest/high watermark, next position and
expiry. Lifetime 15 minutes; expired/invalid/changed-filter cursor returns 400
`invalid-cursor`. No cursor is authorization; every page authenticates again.
Only `limit`, `cursor`, and each route's specified query parameters are accepted;
reject unknown/repeated parameters. Review-finding pages use the immutable summary
manifest; history pages use existing immutable versions, requiring no new mutable
pagination snapshot store. Client verifies identities/digests on every page.

Mutation requests use exact `subject`, `expectedVersion` (1..10000), and
`operationId` UUID. Reusing the same operation/body returns its original outcome,
even after later history; changed reuse returns 409 `idempotency-conflict`.
A new stale version returns 409 `version-conflict`. Authenticate on every replay.
The existing finding event bound of 2 MiB remains; mutation bodies are at most
8 KiB. Reject unknown fields. Never accept caller-chosen confirmation state.

- `POST /v1/findings/{id}/dispositions`: only operator `false-positive` or
  `resolved`, with nonblank reason (at most 4096 UTF-8 bytes) and `evidenceDigest` of
  controller-readable evidence authorized for this finding/subject. The server
  resolves the evidence; a supplied hash alone proves nothing. Exact legal
  transitions remain governed by `createFindingTransitions`; no force override.
- `POST /v1/findings/{id}/reproductions`: request selects `approvalId` UUID and
  `approvalDigest`, not an executable plan. Operator registry/authorizer resolves
  the complete approved immutable plan and verifies exact finding version,
  subject, assertion bytes, runner and limits. Server-owned plan ID becomes the
  reproduction ID; operation ID remains request replay identity. Never accept
  commands, URLs, images, credentials or budgets from the caller. Return 202
  with operation ID, reproduction ID and plan digest after durable dispatch.
- `GET /v1/finding-reproductions/{id}?reviewId=UUID` exposes exact plan/finding
  references, dispatch/cancellation disposition and verified receipt or null,
  without executable assertion bytes or secrets. A receipt is never synthesized.
- `POST /v1/finding-reproductions/{id}/cancellation`: empty body, monotonic durable
  cancellation, same acknowledgment semantics as review cancellation.

07c-3 must finalize the reproduction status fields with real configured dispatch
and recovery, plus the operator evidence/approval registry configuration. The
selection/authority boundary above is fixed now; no public reproduction route or
client method ships until that remaining response contract and consumer pass
acceptance. Never-staged cancelled work has null receipt and remains unverified.
These are explicit later-slice decisions, not missing user accounts or permissions.

## Export and read bounds

`GET /v1/model-reviews/{id}/export` produces `application/x-ndjson` for any
admitted review, including queued, failed and cancelled execution. Export is
required by M3-C11. A complete download certifies the captured retained snapshot,
not successful or complete execution. It includes the admitted request, retained
summary or null, retained reviewer results, and associated finding histories
through captured versions. Missing configured roles are explicit in the header
manifest; missing evidence is never replaced by a successful empty result. It contains no repository source text, credentials or private
provider continuation fields. Public reviewer text may be sensitive evidence and
stays authenticated. Reproduction references/receipt digests remain references;
container logs and artifact bytes are not embedded.

Before sending headers, capture status, configured role/request identities,
retained `{requestId,digest}` result references and sorted finding
`{id,throughVersion,lastDigest}` references in one consistent read snapshot. Stream retained immutable
records afterward, bounded by that manifest; don't hold a transaction for the
network lifetime. Header binds review identity, admission digest, optional summary digest and this
manifest. Derive configured request IDs from the immutable admitted profile and
admission timestamp; read retained roles even if final summary insertion failed.
Associate findings by the admission's deterministic finding operation IDs and
authenticated retained-role provenance, never just matching PR number. 07c-2 owns
any additional bounded scoped reads needed to recover that association. Capture
missing role IDs explicitly, not as zero-cost or clean outcomes. Records follow
header, retained reviewer results in configured role order, then
finding histories by finding ID and ascending version, then one end frame.
A null summary remains null in export and cannot satisfy a Check success gate.
Each frame contains `type,data,sequence,previousDigest,digest`; sequence starts 0,
initial previous digest is `sha256:` plus 64 zeros, digest hashes canonical bytes
of the other four fields. End data repeats the snapshot digest, reviewer/event
counts and last content digest. Snapshot digest hashes canonical header data
excluding its `snapshotDigest` field. End is mandatory; reject missing, duplicate,
reordered or extra frames, mismatched counts/identities/domain hashes, or trailing
bytes. A transport-success status or valid prefix does not certify completeness.

No resume token in M3: retry downloads a new whole snapshot and cannot concatenate
prefixes from different attempts. Client returns/yields provisional records until
end verification, with a separate complete certification. The existing eval
export remains unchanged and is not falsely reused as a model-review schema.
07c-2 owns the executable model-review frame schema/verifier and full nonempty
export fixture, using these frozen semantics and authoritative domain validators.

JSON responses max 4 MiB; export frames max 4 MiB, aggregate max 128 MiB,
server deadline 120 seconds, two active exports per service. Exceeding planned
snapshot bounds fails before streaming with 413 `response-too-large`; dynamic
failure after headers aborts the stream with no valid end. Item size is bounded
by domain validators; return a bounded error rather than skip oversized evidence.
Clients refuse redirects, bound bytes/time, and preserve explicit unknown usage.

## HTTP failures and compatibility

All new JSON responses use `Content-Type: application/json`, `Cache-Control:
no-store`, `X-Content-Type-Options: nosniff`. Errors are exactly
`{error:{code}}`; stable codes/statuses are in the draft operation map. No stack,
provider error, secret, SQL, or user-supplied diagnostic text. Bodyless cancellation operations require no Content-Type header and reject a
nonempty body. Wrong method is
405 with `Allow`; unsupported content type/encoding is 415; malformed UTF-8/JSON,
unknown fields and invalid query are 400. Do not silently coerce or ignore them.
Use `Retry-After: 1` on transient 503 and nonterminal status polling guidance;
clients use bounded backoff, preserving mutation IDs. Success bodies never contain
credentials. New validators reject extra fields; compatibility policy for new
response fields must be reviewed before changing the published schema.

Safe profile discovery: `GET /v1/reviewer-profiles` (read credential) returns at
most the 64 configured `{id,revision,mode,revoked}` descriptors, no budgets,
provider keys, selected paths or full prompts. Sort by ID/revision; one bounded
response, no pagination. Discovery is not authorization to execute.

New CLI group: `agentci model-review submit|show|cancel|findings|export` and
`agentci finding show|history|reproduce|cancel-reproduction|disposition`.
Credentials come from separate private read/mutation config/environment; never
argv. Preserve existing `agentci review --config PRIVATE_JSON --pr NUMBER` and
its deterministic/eval behavior. Client/CLI verify expected exact subject and
canonical evidence digests; stable JSON errors and exit codes: 0 successful
operation, 1 verified policy/behavioral failure when explicitly evaluating an
outcome, 2 invalid input/auth/transport/incomplete evidence. Admission or
cancellation acknowledgment is not a passing review. Exact flag names/help belong
to 07c-4 and must use the shared resource/identity semantics above.

All operations map to original spec sections 12, 31 and 32. Applicable real HTTP,
transaction/replay, isolation, recovery, packaged client/service and compatibility
acceptance remains required in owning PRs. Draft fixture tests prove only domain
coherence and design examples, not running service authorization or durability.
