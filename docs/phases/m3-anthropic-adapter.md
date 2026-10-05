# M3 Anthropic adapter (in progress)

M3-03 is independently tracked within M3; it does not close M3-02 or advance the
milestone. Its branch currently builds on the OpenAI adapter branch's unreleased
provider-contract additions. Keep the adapter changes in a separate PR.

The official `@anthropic-ai/sdk` stable version 0.131.0 was checked at adoption and
pinned in both locks. The initial Messages API mapper retains system instructions,
text/tool-call ordering, grouped tool results, output schemas and supported sampling
parameters. Requests select `standard_only` service. Portable metadata remains
controller-side and is not converted into an upstream user identifier.

A distinct developer instruction role is rejected explicitly. No implicit role
merging or endpoint override occurs. This is a partial implementation: provider
schema preflight, registered model profiles, shared conformance and authorized live
acceptance remain required. No live Anthropic request has been made.

Sources: [official SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript),
[Messages reference](https://platform.claude.com/docs/en/api/typescript/messages/create).

Response normalization now separates refusal, truncation and pause from completed
output, validates tool proposals, and retains observed model identity. Input-token
totals include reported cache creation/read counters; missing counters leave total
input usage unknown. Dollar cost is never inferred as a reported charge. Unknown
output kinds and unapproved model identities fail with redacted errors.

The transport fixes the Messages API origin, disables redirects, SDK retries and
logging, passes cancellation/deadlines, and bounds response bodies at four MiB.
Explicit API-key authentication disables ambient bearer-token configuration.
Synthetic fetch tests exercise the official SDK for JSON, SSE and error responses;
authentication/invalid input are terminal, while throttling and overload remain
explicitly retryable under the controller policy. Raw errors are never surfaced.

The stream translator checks sequential block indices, complete block lifecycles,
cumulative usage and an explicit final message stop. Tool JSON is assembled and
validated only as a proposal; truncated arguments are discarded. Unknown events,
model switches, decreasing counts and missing terminal events fail acceptance.
Reasoning blocks are non-actionable and not exposed as review text.

The registered provider now composes request, transport, stream and response
validation through the common executor. Profiles are detached, allowlist models
and returned snapshots, declare capabilities and cap output tokens. Cost reservation
uses full context at configured upper prices. Synthetic SDK tests pass the shared
structured/streamed/tool-proposal suite with accounting before each result.
Production capability/pricing profiles and provider-specific schema preflight are
still pending; fixture profiles are not production settings.

Schema preflight now enforces documented combined strict-tool, optional-field and
union limits. Unsupported scalar/array constraints, recursive/external references
and references inside `allOf` are rejected without rewriting caller schemas.
Execution tests verify rejection before reservation or fetch. Unpublished provider
compiler limits still require server-side handling; passing local preflight is not
proof of live acceptance. [Provider schema limits](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations).
