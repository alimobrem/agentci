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

Transport, provider-specific schema preflight, response/stream validation, model
profiles, encrypted reasoning continuation, package acceptance and authorized live
smoke remain pending. No live xAI request has been made. The SDK's optional partial
JSON convenience output must not be accepted as a completed finding, and automatic
retries must be disabled so every attempt uses the durable budget ledger.
