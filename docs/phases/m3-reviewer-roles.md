# M3 reviewer roles — development

M3-05 begins with seven controller-owned instruction templates and an internal
independence policy. `reviewerInstructions` covers SPEC-12.1-001 through 008;
`createIndependencePolicy` covers the policy boundary in SPEC-12.2-001.
`tests/reviewer-policy.test.ts` checks role selection, upstream aliases, missing
and wrong-subject provenance, fixture/external separation and identity mutation.

The identity registry and coding provenance must originate in the authenticated
controller. This module does not verify signatures or make repository-provided
claims trustworthy. It snapshots configured upstream identities; a provider alias
cannot establish independence. Its synthetic outcome must remain visibly
synthetic in later evidence and UI. An external-mode decision checks configured
identity separation, not live provider availability or compatibility.

This is internal policy groundwork, not a completed reviewer. Persistent result evidence, hosted adversarial acceptance and customer/API integration
remain open. Instruction text alone is not a prompt-injection security boundary. Model
claims must remain proposed until independent reproduction evidence exists.

## Bounded request assembly

`buildReviewContext` accepts an exact organization/repository/PR/base/head identity
and at most 64 selected base/head source, requirement or diff documents. Each
content digest is verified; duplicate references, unsafe paths, malformed Unicode,
extra fields and oversized inputs fail without echoing content. A document is at
most 32 KiB; the entire serialized context is at most 64 KiB. Nothing is silently
truncated. Sorting gives deterministic identity regardless of collection order.
The controller must still prove that the selected bytes came from that authorized
snapshot and explain selection coverage; content hashing alone cannot prove origin.

`prepareReviewerRequest` places the context in one user message under separate
controller-owned role instructions, grants no tools, and validates the normalized
provider request. It retains configuration, prompt, context and complete request
digests. Configuration includes response schema, model parameters, execution
policy and provider extensions. Tests place instruction-override and credential
exfiltration text in repository evidence and prove it cannot overwrite system
instructions or grant tools. This tests structural isolation, not model obedience.
The controller must authenticate provenance before constructing the executor.

## Budgeted execution boundary

`createReviewerExecutor` snapshots controller-owned provider registrations and binds
one tenant/repository scope and budget ledger. It prepares the bounded request,
checks exact-subject coding provenance and upstream independence, and includes the
policy/provenance digest in the request reserved by `invokeModel`. The existing
core performs cancellation, deadlines, bounded retries and accounting. No new
provider retry loop or credential lookup is introduced.

Synthetic mode accepts only fixture reviewers; external mode rejects fixtures.
Successful output is explicitly proposed, never confirmed. Refused or incomplete
responses produce no proposal. The result binds role, subject, request/attempt,
model, usage and digests while omitting private continuation material. Persisting
that result and proving its durable retrieval remain later acceptance work.
Tests exercise all seven roles, cross-scope/policy rejection before reservation,
budget exhaustion, malformed output, refusal, cancellation and accounting failure.
These fixture tests prove control flow, not live upstream quality or compatibility.

## Adversarial regression corpus

`evals/agentci-reviewers.yaml` freezes nineteen assertions across five scenarios:
identity policy, context isolation, budgeted execution, adversarial output and
result integrity.
The fixture deliberately follows malicious repository suggestions in its output:
unauthorized tool calls, forged confirmation fields, wrong request identity,
confirmation language and truncated claims. Controller checks must reject invalid
output or retain a visibly synthetic, proposed/non-actionable result. This is a
controller-boundary evaluation; it does not measure a live model's susceptibility.

The harness rejects missing/skipped/cancelled assertions. The mutation verifier
removes the synthetic/external dispatch guard only in a temporary source copy and
requires the execution scenario to fail. Local baseline and mutation acceptance
passed. CI retains `releases/reviewer-boundary-eval.json`; isolated hosted execution
and later two-sided frozen-baseline acceptance are still required before task closure.

## Result contract before persistence

The strict versioned `reviewer-result.schema.json` and shared API fixture define
what may be retained. `validateReviewerResult` checks exact expected subject,
policy/provenance relationships, response and authorization digests, usage
semantics and proposed-only output. Unknown/private continuation fields,
non-JSON values, deep recursion and payloads over 2 MiB are rejected. Completed
executor output and refusals are checked against this contract in tests.

The validator does not authenticate an author or reconstruct omitted original
request/context bytes. A durable store must bind the whole record digest, writer
scope and immutable request identity; the PostgreSQL store below implements that binding.
The compiled package includes the schema as a runtime asset.

## Durable PostgreSQL results

Migration `005_m3_reviewer_results.sql` follows the checksummed, serialized
migration protocol and requires migration 004. `ReviewerResultStore` binds a
controller-owned organization/repository/budget. A write requires the exact
request digest and attempt in that budget, settled reported cost or an unknown
reservation. Concurrent identical writes reuse one immutable record; changed
bytes conflict. Reads revalidate subject, full-record digest and internal hashes.
SQL updates are rejected. A reconstructed store can retrieve retained results.

Real PostgreSQL acceptance covers concurrent writes, scope/commit rejection,
pre-accounting rejection, cost mismatch, unknown reservations, repeated migrations
and update rejection. The store is internal, with no customer read endpoint yet.
The persistence wrapper below connects execution, save and recovery; Temporal
scheduling and customer/API integration are still pending. Pool setup
must bound connection time; transactions bound locks and statements and return
redacted storage errors. The migration and result schema ship in the package.

## Idempotent persistence wrapper

`createPersistentReviewer` authorizes and snapshots one execution plan before
awaiting storage. A committed result with the exact request digest is reused;
changed input under the same request ID conflicts. Missing results execute through
the ledger and must save before success is returned. Concurrent attempts may see
an explicit ambiguous-attempt error; retrying the exact input can retrieve the
winner's committed result without another provider call.

If a process dies after accounting but before saving, output cannot be reconstructed
from usage alone. The durable ledger fences redispatch and the wrapper returns an
ambiguous attempt, rather than silently billing again or claiming recovered output.
A new execution requires an explicit new request ID within the same authorized
budget. Each reviewer role needs its own stable request ID. The controller must
retain exact configuration/deadline inputs for receipt recovery.

PostgreSQL tests exercise duplicate dispatch races, reconstructed-controller replay,
changed-input conflicts, failed save after settlement and input mutation during
storage lookup. Storage unavailability has a separate redacted error from an
immutable evidence conflict. These checks do not replace Temporal crash/recovery
acceptance or a released customer demo.
