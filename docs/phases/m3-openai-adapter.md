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
the normalized model-event translator is still under implementation. A synthetic
fetch implementation exercises the actual SDK without contacting a provider.

Error mapping strips raw messages and bodies. Quota failures do not retry. Retryable
throttling/transport errors carry bounded retry-delay metadata; the controller does
not shorten a server delay that exceeds its allowed delay/deadline. Connections
with uncertain outcomes retain budget reservations. Backoff uses jitter.

Remaining: strict schema subset preflight, model capability/pricing configuration,
normalized stream translation, complete adapter registration, conformance and
failure/recovery tests, and authorized live acceptance. Model aliases/snapshots need
an explicit identity policy; current response mapping requires exact configured
model identity. No live model call has been performed and this is not M3 completion.

Sources checked during adoption:
- [Official JavaScript SDK](https://developers.openai.com/api/reference/typescript)
- [Rate-limit handling](https://developers.openai.com/api/docs/guides/rate-limits)
- [Streaming event definitions](https://developers.openai.com/api/reference/resources/responses/streaming-events)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
