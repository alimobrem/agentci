# HTTP eval provider contract (M2 candidate)

This is the versioned adapter protocol for an operator-selected evaluation
service. AgentCI sends one trial per POST. The provider owns the evaluation
algorithm; AgentCI validates identity, normalizes scenario results, repeats trials
and compares the baseline and head. It does not execute provider or PR code on
the control service.

For extension choices, native wrappers, registration and conformance, see the
[adapter-authoring guide](adapter-authoring.md).

## Suite and operator configuration

An HTTP suite declares an opaque provider ID, not an endpoint or credential:

```yaml
runner:
  adapter: http
  provider: example
  timeoutMs: 30000
  maxOutputBytes: 1048576
```

HTTP suites cannot declare a command or report path. Existing local adapters
still require argv and their managed report format. The unreleased M2 schemas
define this distinction; no released M1 API compatibility baseline is changed.

The trusted worker supplies `httpProviders` in its execution policy. Each entry
has `id`, an immutable `revision` (`sha256:...`), `endpoint` and a literal pinned
IP `address`. Only one entry may match a suite. HTTPS verifies the endpoint
hostname and certificate while connecting to that exact IP; redirects are
rejected. Private service addresses can be explicitly pinned by the operator.
There is no DNS lookup or repository-controlled destination selection.

Optional `authorization` is separately scoped to the eval service; it is never
read from the controller environment or sent in JSON. Optional `tlsCa` provides
an explicit certificate authority for a private service while preserving
hostname verification. No production TLS verification bypass exists. Plaintext
HTTP requires `allowInsecureLoopbackForTests: true` and an exact loopback literal.
`maxRequestBytes` defaults to 1 MiB, with an operator ceiling of 64 MiB. The suite
response limit is independently bounded; oversized requests dispatch nothing.

## Request and response

Both envelopes use `apiVersion: agentci.io/v1alpha1`. The normative schemas ship
with the package:

- `packages/evals/json/http-eval-request.schema.json`
- `packages/evals/json/http-eval-response.schema.json`

The request has kind `HttpEvalRequest`, a UUID `requestId` for the logical trial, the exact
subject `sourceSha`, canonical effective-files `inputDigest`, manifest
`suiteRevision`, configured `providerRevision`, validated `suite`, bounded `files`
and optional configured `model`. Files have already undergone protected-input
projection. In a comparison they contain baseline assertions and the requested
subject implementation. EvalRun separately records assertion commit, effective
input digest and omitted protected paths.

The response must be HTTP 200, uncompressed UTF-8 JSON, kind `HttpEvalResponse`,
with the same identity fields (including model when requested) and `results`:

```json
{
  "scenario": "safe-response",
  "status": "passed",
  "latencyMs": 12,
  "costUsd": 0.001,
  "totalTokens": 8
}
```

Each row belongs inside the response's `results` array. Status is `passed`,
`failed`, `error` or `skipped`; `critical` is an optional boolean. Metrics are
optional nonnegative observations; tokens must be a safe integer. Every declared
scenario must appear exactly once. Empty, duplicate, undeclared, malformed or
contradictory results cannot pass. Unknown envelope/row fields are rejected.
Missing metrics stay absent. Failed assertions are behavioral results; transport,
TLS, protocol, identity, evaluator and report errors remain infrastructure errors.
Skipped or unexecuted trials cannot satisfy a complete passing sample.

EvalRun records `runnerProvider: {id, revision}` for HTTP execution instead of
`runnerImage`. Exactly one provenance form is required. Comparison rejects a
changed provider identity/revision, just as local comparisons reject a changed
runner image. The configured remote revision and echoed identities establish the
provider contract; they are not an independent attestation of remote execution.

## Retry identity and provider obligations

A durable unit derives each trial's request UUID from its immutable unit UUID and
zero-based index. The algorithm is SHA-256 name-based UUIDv8, with the name
`agentci:http-eval-trial:v1:<index>` and the unit UUID as namespace bytes, following
the [RFC 9562 Appendix B.2 construction](https://www.rfc-editor.org/rfc/rfc9562.html#appendix-B.2).
Standalone suite executions receive a new run UUID. Trials and units have distinct
IDs; resuming the same uncommitted trial repeats its ID. A committed normalized
checkpoint is reused without an HTTP request.

Compatible providers must atomically claim the request ID within the authenticated
provider/revision scope and compare the entire request's canonical digest. A
matching retry returns the retained response with the same identities and metrics.
A conflicting payload under the same ID must fail, for example with HTTP 409;
AgentCI reports it as an infrastructure protocol error. Retain deduplication state
through the supported retry/resume window. Authorization stays in the header.

Stable IDs enable deduplication; AgentCI cannot enforce how a remote service bills
or performs its downstream calls. If the provider ignores IDs, expires them too
soon, or cannot deduplicate an interrupted downstream action, execution can repeat.
This is not an exactly-once guarantee. A new explicit evaluation attempt creates
new unit IDs and deliberately executes new trials. Recorded infrastructure errors
remain immutable evidence; they are not silently replaced by retries.

The real HTTPS/PostgreSQL recovery test interrupts execution both before and after
a checkpoint commit. It verifies cached response replay, no request for a retained
observation, distinct trial/unit IDs, conflicting-payload rejection and invalid-ID
rejection before dispatch.

## Acceptance mapping

`POST` to the operator's configured endpoint implements SPEC-11.4-005 and
SPEC-40-034. The default trial/comparison path also contributes to SPEC-40-035–037.
The operation mapping is `specs/api/http-provider-operation.json`; it describes
an outbound provider call, separate from the released control API's operations.

| Test in `tests/eval-http.test.ts` | Observable acceptance |
| --- | --- |
| Operator configuration | No URL credentials/query, missing pin, remote plaintext, invalid auth or mutable revision |
| Real HTTP transport | Every identity field checked; redirects, media/encoding, disconnects, private errors, size/deadline/cancellation contained |
| Real HTTPS transport | Trusted CA succeeds at pinned IP; untrusted certificate and hostname mismatch send no input/auth |
| Default trial pipeline | Three baseline/head observations, frozen assertions, model variants, exact provider provenance, malformed results and unknown/duplicate provider rejection |

The transport task passed full CI; the newer retry-identity task remains open
until final-source CI verifies it. Durable eval jobs,
customer-facing eval APIs/PR Checks, published native images, final vulnerability
assessment, release/download verification and the phase demo remain separate M2
gates.
