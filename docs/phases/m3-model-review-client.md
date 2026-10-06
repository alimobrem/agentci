# Model-review client and CLI: admission and evidence reads

Development support for profile discovery, admission, status, cancellation, and
finding evidence reads. Export, reproduction, and disposition commands remain pending later
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
