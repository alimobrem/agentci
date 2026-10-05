# Model-review client and CLI: initial transport slice

Development support for profile discovery, admission, status, and cancellation.
Findings, export, reproduction, and disposition commands remain pending later
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

Node consumers import `ModelReviewClient` from
`agentci/dist/packages/client/model-review.js`:

```js
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

Transport-fixture and executable CLI tests cover client behavior. They do not
replace the required integrated real-server/PostgreSQL acceptance, installed
package checks, or milestone release gates.
