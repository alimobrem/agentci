# Model-review client and CLI: admission and evidence reads

Development support for profile discovery, admission, status, cancellation, and
finding evidence reads and certified export downloads. Retained reproduction status/cancellation are available in development; reservation and disposition commands remain pending later
M3-07c slices. This document does not declare M3 released.

Keep the exact admission JSON used for submission. It contains the request UUID,
organization/repository/PR/base/head, immutable profile ID/revision, and review
mode described in [the API contract](m3-customer-api-contract.md). `show` and
`cancel` use it to verify the returned admission identity and digest. A reused
UUID must keep identical normalized content; use a new UUID for a deliberate
rerun. A timeout does not cancel work.

Provide `AGENTCI_API_URL` and `AGENTCI_OPERATOR_TOKEN` through your private
environment. `AGENTCI_EVIDENCE_TOKEN` supports reads; when both are present,
reads use the evidence token and mutations use the operator token. Tokens must
differ. Alternatively, use `--config /absolute/private/client.json` with mode
0600 and this structure:

```json
{
  "url": "https://your-agentci.example",
  "readTokenFile": "evidence-token",
  "operatorTokenFile": "operator-token"
}
```

Token files are private regular files (0600), resolved relative to the config.
Either credential may be omitted; mutations require the operator credential.
The config takes precedence as a complete credential source; it does not merge
with environment tokens. Inline credentials and token command-line arguments
are rejected. Never commit these files. A single terminal newline in token files
is allowed; embedded CR/LF is rejected.

```sh
agentci model-review --help
agentci model-review profiles --config /absolute/private/client.json
agentci model-review submit --request /absolute/admission.json --config /absolute/private/client.json
agentci model-review show --request /absolute/admission.json --config /absolute/private/client.json
agentci model-review cancel --request /absolute/admission.json --config /absolute/private/client.json
```

Successful operations print the verified JSON response and exit 0. This does not
mean the review passed: queued/failed execution, refused roles, synthetic mode,
and partial selected coverage retain their explicit meanings. Cancellation first
verifies the pinned admission, then records intent; it does not guarantee that a
remote request stopped or that charges were refunded. Input, authentication,
transport, and invalid-evidence failures print `{error:{code}}` to stderr and
exit 2. This initial slice does not implement an outcome-evaluation command or
use exit 1. Existing `agentci review` behavior is unchanged.

Node consumers use the supported `agentci/client` package export:

```js
import {ModelReviewClient} from 'agentci/client';

const client = new ModelReviewClient({
  url: process.env.AGENTCI_API_URL,
  operatorToken: process.env.AGENTCI_OPERATOR_TOKEN
});
await client.profiles();
await client.submit(admission);
await client.show(admission);
await client.cancel(admission);
```

The client rejects redirects, bounds JSON responses to 4 MiB, validates domain
digests and exact admission identity, and retries transient transport failures or
503 responses at most three times using the same request. Its default 15-second
deadline includes response reading and backoff for each HTTP operation; cancellation
performs a separate bounded status read before its mutation. `timeoutMs` may be
set from 1 to 120000 and `maxAttempts` from 1 to 3 by Node callers. No polling or
provider-readiness claim is inferred from profile discovery.

Transport-fixture and executable CLI tests cover malformed responses, private
configuration, bounded retry, and credential-free help. The integration test
`tests/integration/model-review-client.test.ts` also passed against the actual
HTTP handlers, PostgreSQL stores and Temporal workflow: concurrent/replayed
admission, queued status, seven-role synthetic completion, exact identity checks,
and late cancellation preserving terminal evidence. All four CLI commands passed
through that real HTTP service.

The same integration test passed with `AGENTCI_TEST_CLIENT_PACKAGE_ROOT` pointing
to a production-only offline installation of the packed application. The test
resolves `agentci/client` from that consumer installation, enforcing the package
export map and shared `AgentCIError` identity. This verifies the installed client
and executable; it does not claim a packaged control-service
deployment, live provider acceptance, hosted combined CI, or an M3 release. Full
package smoke and the remaining milestone gates retain their separate evidence.


## Finding evidence reads (M3-07c-2A client)

```sh
agentci model-review findings --request /absolute/admission.json --limit 25
agentci finding show --request /absolute/admission.json --id sha256:FINDING_HASH
agentci finding show --request /absolute/admission.json --id sha256:FINDING_HASH --version 1
agentci finding history --request /absolute/admission.json --id sha256:FINDING_HASH --limit 25
```

Replace `sha256:FINDING_HASH` with the lowercase SHA-256 ID returned by the service.
All commands accept the same private `--config` option. Read routes require the
control service's configured cursor-signing key. Page sizes are integers 1–100.

`model-review findings` traverses all pages before printing one complete list. Its
references are pinned to the original summary, even when a finding's current
state has changed. It checks every reference against the saved summary and fails
if a page omits, substitutes, duplicates, or reorders a reference. It returns
`review-not-complete` until a summary exists. `finding show` reads current state;
`--version` selects a retained historical event, including a summary's pinned
version. Show/history can read retained findings during a partially completed
review when the server verifies their association with that review.

`finding history` emits one verified JSON page per line through a fixed version
watermark. Pages validate event digests, exact subject, contiguous versions, and
lifecycle transitions, including page boundaries. New events after the watermark
belong to a later traversal. **A prefix is provisional: require exit 0 and a final
page with `nextCursor: null` before treating history as complete.** An interrupted
command exits 2; earlier stdout pages must not be mistaken for a complete export.
These history pages are not a certified export format.

```js
const references = await client.findings(admission, {limit: 25});
const pinned = references.items[0];
if (pinned) {
  const current = await client.finding(admission, pinned.id);
  const original = await client.finding(admission, pinned.id, {version: pinned.version});
  if (original.digest !== pinned.digest) throw new Error('Pinned finding mismatch');
  for await (const page of client.findingHistory(admission, pinned.id, {limit: 25})) {
    // Consume provisional pages; certify traversal only after the loop completes.
  }
}
```

Pagination uses opaque server cursors, a 120-second traversal deadline including
the initial identity read, and an optional Node caller `signal`. Each HTTP read
keeps its existing per-operation timeout. History is capped at 10,000 versions and
32 MiB in total. Malformed/expired cursors, missing final pages, changed watermarks,
and invalid transitions fail closed. The focused fixture tests exercise these
client boundaries. The real HTTP/PostgreSQL/Temporal acceptance also passed with
the compiled client and again with the offline production-only installed public
package and CLI. It verifies summary pins survive a real queue transition,
current versus historical reads, full paginated history, and the read commands.
The local acceptance record is `delivery/acceptance/m3-07c-client-reads.json`;
hosted CI, certified export, and milestone release gates remain separate.


## Certified export downloads (development source)

```sh
agentci model-review export --request /absolute/admission.json > review-export.ndjson
```

The client validates the export header against the exact saved admission. It
checks the server's snapshot manifest, frame digest chain, retained reviewer
results, and complete finding histories through the shared domain verifier.
Each output line with `type: "record"` is explicitly `provisional: true`, including
the server's end frame. Only after the HTTP body reaches EOF and verification
finishes does the client emit `type: "complete"` with the header and end digest.
Require this certificate and exit 0 before accepting the file. A valid prefix,
missing end, trailing content, disconnection, or deadline failure exits 2 and
leaves any earlier records provisional. A certified download can still describe
a partial, failed, or cancelled review; inspect its status and coverage.

```js
let completion;
for await (const item of client.modelReviewExport(admission, {signal})) {
  if (item.type === 'record') retainProvisional(item.frame);
  else completion = item.data;
}
if (!completion?.complete) throw new Error('Incomplete export');
```

The export deadline defaults to 120 seconds, including response reading and CLI
output backpressure. If an open downstream pipe stops reading, the CLI exits 2
and discards pending output when the deadline expires; reporting the error is
best effort with at most 100 milliseconds for stderr to flush. Treat any partial
output as invalid, even if earlier lines were verified. Node
callers may set `timeoutMs` from 1–120000 or supply an abort signal. Frames are
bounded to 4 MiB and the whole response to 128 MiB. Fatal UTF-8 decoding rejects
malformed text. Streaming requests are never automatically retried because a
retry could change the snapshot or duplicate provisional output. Restart an
interrupted download into a new file. Both read credentials and private config
work as for other commands; no credentials appear in the exported records.

Focused tests exercise EOF gating, truncation, trailing records, malformed UTF-8,
size limits, identity checks, cancellation (including buffered records while a
consumer pauses), and executable exit behavior. Export acceptance passed against
the real HTTP handlers, PostgreSQL, and Temporal, then again through the offline
production-only installed public client and CLI. Both certify the same retained
seven-reviewer snapshot and full finding history after a queue transition. See
`delivery/acceptance/m3-07c-client-export.json` for the exact tested source and
package. This does not claim packaged control deployment, live providers, hosted
combined CI, or completion of M3.

## Retained reproduction status and cancellation (M3-07c-4a development slice)

These commands operate on an already-reserved reproduction; public reservation and disposition commands remain unfinished. Keep the original review admission and the complete captured reproduction reference supplied by the operator. The reference must contain exactly `schemaVersion`, `id`, `operationId`, `reviewId`, `subject`, `finding` (id, queuedVersion, digest), `planDigest` and `requestDigest`, matching the shared reproduction response contract. A status response includes additional state/evidence fields and is not itself a reference file. No client-generated commands, images, credentials or execution budgets belong in this file.

```sh
agentci finding reproduction-status --request admission.json --reproduction reference.json --config private-client.json
agentci finding cancel-reproduction --request admission.json --reproduction reference.json --config private-client.json
```

The CLI bounds reference files to 8 KiB, rejects symlinks and validates their full shape and admission association. Existing private 0600 configuration/token file rules apply. Never put tokens in argv or the reference. Reads accept the reader or operator credential; cancellation requires the operator credential before any HTTP request. Exit 0 means a verified status read or a retained cancellation acknowledgement, not an assertion pass, verified cleanup or a guarantee execution has stopped. Errors exit 2 with a stable redacted code.

The public `ModelReviewClient.reproductionStatus(admission, reference, {signal})` verifies the original admission then the complete response identity and retained evidence digests. `cancelReproduction(admission, reference, {signal})` preflights that status before posting an empty cancellation request. Both use one overall configured deadline across preflight, response bodies and retries; cancellation retries retain exactly the same ID and empty body. If a write has an ambiguous transport failure, use the same captured reference when retrying and inspect retained status. Caller abort cannot guarantee the server did not already retain cancellation. Late cancellation preserves actual observations; never-staged outcomes keep null execution receipt and unverified non-execution evidence.

The real HTTP/PostgreSQL test uses compiled public exports and a compiled CLI. `scripts/reproduction-client-package-smoke.mjs` repeats it from a fresh production-only package install without a shipped development loader. These checks establish this development slice only. Reviewed prerequisites were merged in PRs #69 and #70; full M3 customer, reservation/disposition, UI, release, publication/download and demo gates remain open.


`agentci finding reserve-reproduction --request ADMISSION_JSON --id SHA256_ID --reservation RESERVATION_JSON` selects a preconfigured operator approval. The typed `reserveReproduction(admission, findingId, request)` method requires the same original admission, operator token, expected finding version, operation ID, approval ID and approved-plan digest. The JSON request contains schemaVersion, reviewId, subject, expectedVersion, operationId, approvalId and approvalDigest only; commands, images, limits and receipts are rejected. Preserve the complete returned reference for status/cancellation. Exact retries retain one intent; changed operation inputs conflict. A 202 is reservation intent, not execution or confirmation. Disposition commands remain unavailable in this slice.
