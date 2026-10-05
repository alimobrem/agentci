# M3 xAI adapter (in progress)

M3-04 implements SPEC-13.3-004 behind the common bounded executor. It follows
the same acceptance corpus; endpoint similarity is not compatibility evidence.

Adoption on 2026-10-05 verified `@xai-official/sdk` 0.2.1 as the official latest
published package, pinned in both locks. The [official TypeScript SDK](https://github.com/xai-org/xai-sdk-ts)
labels its interfaces experimental. The adapter isolates that dependency and will
validate actual serialized SDK requests, stream completion and retry behavior.

The initial request mapper retains separate instruction roles, tool-call/result
ordering, output schemas and sampling controls. It explicitly disables storage,
selects default service, and rejects stop sequences and unknown extensions.
Portable metadata stays controller-side because the SDK's generated API contract
marks upstream metadata unsupported. Schema constraints are retained without
claiming that OpenAI's schema subset applies to xAI.

Provider-specific schema preflight, production model
profiles, package acceptance and authorized live
smoke remain pending. No live xAI request has been made. The SDK's optional partial
JSON convenience output must not be accepted as a completed finding, and automatic
retries must be disabled so every attempt uses the durable budget ledger.

The transport now uses the pinned SDK against only `POST https://api.x.ai/v1/responses`,
with an explicit credential, redirects rejected, retries disabled, deadline/abort
propagation and a four-MiB cumulative response bound. JSON calls explicitly set
`stream:false`; streaming calls consume raw SDK events and require terminal completion.
Semantic stream validation is implemented separately from the transport.

Synthetic SDK tests cover serialized storage/service/authentication settings,
HTTP rate limits and retry delays, server errors, malformed/oversized responses,
cancelled/expired requests and truncated SSE. Stream errors remain potentially
billable even when their code is a rate limit. Returned errors exclude upstream
details. `XAI_DEBUG=1` is rejected before dispatch because this SDK has no per-client
logging switch; the adapter never changes the process environment.

Response normalization checks observed model identity, declared output kinds,
structured output and tool arguments. Refusal/truncation cannot expose actionable
output or continuation. Completed responses retain original output, including
encrypted reasoning, in private prefix-bound continuation.
Missing raw usage stays unknown instead of taking SDK defaults. Reported nano-USD
or USD-tick charges are rounded upward to the ledger's microdollar precision; if
both are present the larger rounded amount is retained. Invalid counts/charges or
reported server-side tool use fail validation.

The stream translator bounds events/bytes, validates item identity and tool-argument
completion, and compares final output against completed items and provisional text.
Optional SDK sequence/locator fields are accepted only when ordering and item
selection remain unambiguous. Missing terminal completion, identity changes,
unknown events and inconsistent final output fail closed. Synthetic SDK SSE tests
exercise the translator as well as direct negative fixtures; live acceptance remains
required. Refusal deltas exposed as unknown by SDK 0.2.1 are recognized narrowly
and retain refusal status without producing actionable output.

`appendXAIToolResults` now validates the completed proposal, binds original output
to the exact preceding conversation, and appends one result per call ID with a new
request ID. It preserves the original deadline and extension controls. The request
mapper verifies the stored content against the normalized assistant projection
before replaying original output unchanged. Tests run two successive tool turns
through the actual SDK, including encrypted reasoning, and reject changed context
or mismatched results. Requested and observed model identity must currently match
for continuation. These local bindings detect inconsistency; they do not authenticate
upstream ciphertext or replace live acceptance.

The registered provider composes request/response/stream/continuation validation
through the common executor. Trusted model profiles are copied, allowlist returned
model identities, enforce capabilities and reserve a full-context upper charge.
Profiles can require continuation for every historical tool proposal. The shared
synthetic SDK corpus covers structured output, streaming, a tool proposal and its
result, with independent reservation and reported-cost settlement for each attempt.
Only fixture profiles are tested so far; no production xAI model is enabled.
