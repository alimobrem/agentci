# M3 OpenAI adapter (in progress)

M3-02 follows accepted provider core M3-01. The official `openai` JavaScript SDK
7.28.0 was verified as the stable npm dist-tag at adoption and pinned exactly in
both dependency locks. Node remains the project's pinned 26.10.0 runtime.

The adapter targets the Responses API. Request mapping preserves separate system
and developer instructions, message/tool-result ordering and strict output schemas.
Unsupported stop parameters and unknown extension keys fail instead of being
silently dropped. Output translation distinguishes refusal and incomplete results
from completed text/tool proposals; missing dollar cost remains unknown.

Transport always uses `https://api.openai.com/v1/responses`, explicit credentials,
null organization/project overrides, disabled SDK logging and zero SDK retries.
Redirects are rejected, response bodies are capped at four MiB, and the controller's
abort signal and remaining timeout reach the SDK. Streams use the SDK's SSE parser;
the normalized translator verifies sequence and item identity, final argument
agreement, and explicit completed/refused/incomplete outcomes. A synthetic
fetch implementation exercises the actual SDK without contacting a provider.
The production-only installed-package smoke also invokes the compiled adapter
through the SDK with synthetic fetch; this verifies packaging, not live acceptance.

Error mapping strips raw messages and bodies. Quota failures do not retry. Retryable
throttling/transport errors carry bounded retry-delay metadata; the controller does
not shorten a server delay that exceeds its allowed delay/deadline. Connections
with uncertain outcomes retain budget reservations. Backoff uses jitter.

Registered model profiles are copied at construction and define capabilities,
context/output limits and upper input/output prices with a pricing revision.
Unknown models and unsupported parameters fail before network access. Reservations
use the full configured context limit at the upper input price plus capped output;
this is deliberately conservative and can hold more budget than actual usage.
Unknown charges remain held until trusted reconciliation. Profiles must cover all
applicable price tiers; fixture prices are not production pricing.

Structural schema preflight rejects open objects, optional properties, unsupported
composition and documented property/enum/string size excesses without rewriting
the schema. Nullable and recursive schemas remain intact. Depth checks follow local
references, reject remote/non-schema references, and stop recursive back-edges.
The documented string-format set and fine-tuned constraint exclusions are checked.
Schema graph traversal is bounded at 50,000 visits. Execution tests confirm rejected
schemas reserve no budget and make no network call. Provider-side live conformance
remains required; local preflight alone cannot prove provider acceptance.

Remaining: complete schema subset preflight, verified real model capability/pricing
profiles, broader conformance and
failure/recovery tests, and authorized live acceptance. Model aliases/snapshots need
an explicit identity policy; current response mapping requires exact configured
model identity. No live model call has been performed and this is not M3 completion.

Sources checked during adoption:
- [Official JavaScript SDK](https://developers.openai.com/api/reference/typescript)
- [Rate-limit handling](https://developers.openai.com/api/docs/guides/rate-limits)
- [Streaming event definitions](https://developers.openai.com/api/reference/resources/responses/streaming-events)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
