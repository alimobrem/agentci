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
schema preflight, registered model profiles and synthetic shared conformance are
implemented; authorized live acceptance and review-loop integration remain required.
No live Anthropic request has been made.

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
The opt-in production profile and schema preflight are described below; synthetic
fixture profiles are not production settings.

Schema preflight now enforces documented combined strict-tool, optional-field and
union limits. Unsupported scalar/array constraints, recursive/external references
and references inside `allOf` are rejected without rewriting caller schemas.
Execution tests verify rejection before reservation or fetch. Unpublished provider
compiler limits still require server-side handling; passing local preflight is not
proof of live acceptance. [Provider schema limits](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations).

`anthropicOpusProfile()` is an opt-in profile for `claude-opus-5-5`, checked against
[official model limits](https://platform.claude.com/docs/en/models/opus-5-5/overview)
and [pricing](https://platform.claude.com/docs/en/about-claude/pricing) on 2026-10-05 UTC.
It uses a one-million-token context, 128,000 output ceiling, $8/M input upper rate
(covering one-hour cache writes), and $20/M output. Sampling overrides are disabled.
The full-context reservation with 256 output tokens is $8.005120, not an expected
bill. No fast/regional inference options or built-in paid tools are exposed.

Opus 5.5 has always-on thinking and model/conversation-bound thinking blocks.
The adapter preserves opaque thinking history for subsequent tool-result turns
through the continuation helper below. Synthetic SDK acceptance covers two tool
round trips and a final answer; live multi-turn Opus acceptance remains pending.

The internal M3 response contract now has optional `continuation`: provider,
observed model, conversation-prefix digest and bounded original content blocks.
Anthropic completed responses retain signed thinking blocks there, including
streamed signature fragments. Review text excludes those blocks. Partial/refused
responses cannot carry continuation. Treat continuation as private provider data;
do not display it as a finding or include it in public evidence. Existing adapters
remain valid without the optional field; released HTTP contracts are unchanged.
Prefix binding covers system/developer instructions, tools, output schema, messages
and prior Anthropic history. Replay validation and append-only tool-result wiring
are exercised through the actual SDK with synthetic HTTP responses.

`appendAnthropicToolResults` now appends a validated assistant proposal and exactly
one result per tool-call ID. It creates a new request ID without extending the
original deadline. The caller may set a fresh authorized deadline explicitly.
The Anthropic `history` extension carries each assistant continuation at its
message index. Request mapping verifies the exact prefix digest, requested model,
and text/tool projection before replaying original content blocks unchanged.
Changed instructions, tools, messages, models or result IDs fail locally. These
checks detect inconsistent local context; provider signatures remain authoritative
and the digest is not an authentication token. Alias-to-snapshot continuation
currently requires matching requested/observed identity. Live multi-turn acceptance
and higher-level review-loop integration remain pending.

The SDK round-trip test checks both earlier signed blocks and grouped tool results
in every subsequent outbound request, separate reservation/accounting for each new
request ID, and local rejection of changed instructions before reservation or HTTP.
This verifies serialization and controller behavior, not upstream signature validity.
Callers must use the continuation helper for signed tool turns: manually rebuilding
portable assistant messages can omit provider state and is not live-validated.
