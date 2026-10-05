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

`evals/agentci-reviewers.yaml` freezes sixteen assertions across four scenarios:
identity policy, context isolation, budgeted execution and adversarial output.
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
