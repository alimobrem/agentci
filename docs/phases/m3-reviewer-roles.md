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

This is internal policy groundwork, not a completed reviewer. Bounded context
assembly, request/config/prompt/context digests, execution through the budgeted
provider core, result evidence, injection evals and customer/API integration remain
open. Instruction text alone is not a prompt-injection security boundary. Model
claims must remain proposed until independent reproduction evidence exists.
