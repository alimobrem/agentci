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

This is internal policy groundwork, not a completed reviewer. Execution through the budgeted
provider core, result evidence, injection evals and customer/API integration remain
open. Instruction text alone is not a prompt-injection security boundary. Model
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
Independence authorization and budgeted dispatch still require execution integration.
