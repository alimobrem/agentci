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
schema preflight, response/stream translation, fixed-origin transport, error
mapping, registered model profiles, shared conformance and authorized live
acceptance remain required. No live Anthropic request has been made.

Sources: [official SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript),
[Messages reference](https://platform.claude.com/docs/en/api/typescript/messages/create).
