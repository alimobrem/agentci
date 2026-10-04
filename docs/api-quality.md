# API correctness gates

API correctness is a release blocker for every milestone that introduces or
changes an API. These gates apply to REST endpoints, webhooks, internal events,
and adapter contracts within that milestone's scope. They do not imply that M0's
development skeleton already meets production API requirements.

## Design before implementation

Maintain a versioned, machine-readable contract for each shipped interface:
OpenAPI for REST, JSON Schema for events and webhook payloads, and explicit adapter
contracts. Define methods, routes, headers, request/response schemas, status codes,
and examples before implementing a new public endpoint. Reuse the project's
domain schemas; do not maintain conflicting copies of the same data contract.

Each operation must map to specification requirements and an acceptance scenario.
Record its invariants, authorization rules, state transitions, and failure cases.
An endpoint list alone is not an API design. Review changes from the caller's
perspective, including what callers can safely retry and depend on.

For each operation, explicitly specify applicable behavior for:

- Required, optional, absent and null fields; unknown fields; identifiers and
  timestamps; size/range limits; invalid encodings and malformed payloads.
- Success and error schemas, stable error codes, validation details, and relevant
  response headers. Errors must not leak secrets or internal stack traces.
- Authentication, permissions, tenant isolation, and object-level access checks.
- Retry safety, idempotency-key scope and retention, duplicate delivery, conflicting
  reuse of a key, concurrent requests, and partial failure recovery. Spec section
  31.2 requires idempotency keys for mutations triggered by webhooks.
- Pagination, filtering and ordering where supported, including stable traversal
  when data changes and explicit bounds on result sizes.
- Asynchronous job states, cancellation, timeouts, polling, and terminal outcomes
  where supported. Accepting a request must not imply its work succeeded.
- Immutable evidence references and exact PR-head identity where applicable;
  stale work must not publish results against a newer head.

Mark inapplicable behaviors with a scope-based reason. Do not leave them implicit.

## Verification that blocks release

Validate the API description and examples in CI. Test requests and responses
against the contract, including errors and headers, so implementation drift fails
the build. Expected behavior must come from reviewed requirements and examples;
tests that merely reproduce implementation decisions are insufficient evidence.

Exercise each shipped operation through its actual HTTP/event boundary. Cover
happy paths, boundary values, invalid inputs, unsupported methods/media types,
missing and insufficient credentials, cross-tenant access, and relevant resource
state transitions. Verify observable results and side effects, not just status
codes. Add concurrency, replay, timeout and recovery scenarios when the operation
can mutate state or dispatch work.

Run applicable integration tests against real persistence and orchestration
dependencies. Mocks alone cannot prove transactions, durable retries, or webhook
replay safety. Verify external adapters against provider contracts or supported
test environments; record what was verified and what remains unverified.

Run API acceptance scenarios against the packaged service/container using the
documented configuration. Verify startup, readiness, shutdown, body/time limits,
and sensitive-data handling. A source-only test does not prove the distributed
service works.

## Compatibility and release evidence

Compare contracts with the previous release in CI. Review changes to schemas,
defaults, status codes, errors, authorization, and behavior, including changes a
schema diff cannot detect. A `/v1` prefix alone is not a compatibility guarantee.
Breaking changes require an explicit version/migration decision and release notes.

Record the contract revision, operation/requirement coverage, compatibility review,
CI results, packaged-service scenarios, and any scope-based inapplicability reasons
in the milestone release record. Unresolved contract drift, missing applicable
cases, access-control failures, or unverified retry semantics block completion.

M1 must establish these gates for its API and webhook surface before it can be
called complete. Future milestones extend the contracts and verification with
their own shipped operations; they do not bypass the gates.

## Current API automation

`specs/api/operations.json` maps every control operation to requirements and HTTP
scenarios. Shared fixtures are in `tests/fixtures/control.ts`. Fast checks reject
unmapped operations or API/domain schema drift. Full CI runs checksum-verified
oasdiff against the immutable released M1 0.2.1-m1 contract and a deliberate
breaking endpoint-removal case. The prior candidate baseline remains preserved.
Baseline provenance/checksums are in `specs/api/baselines/m1-0.2.1-identity.json`;
its paths/components match the prior candidate. Review behavioral compatibility
separately; never advance the baseline to conceal a breaking change.

## Agent evidence consumption — M1 extension

The released Node client is an API consumer, not a new scheduling endpoint. It
uses the existing readiness/evidence operations, verifies shared schemas and
PR/base/head/repository identity, and checks the canonical digest. Its credential
comes from private environment configuration and is never supplied on argv.
HTTP redirects are refused, timeouts and a 4 MiB response bound are explicit, and
provider errors are reduced to typed safe codes. Authentication, corruption,
identity mismatch, redirects and unavailable services have client regression tests.
The live customer gate requires executing this client against the fresh-repository
deployment; mocked HTTP tests alone cannot close it.
