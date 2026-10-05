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

The internal executor and persistent result store are implemented. Hosted adversarial
acceptance and customer/API integration remain open. Instruction text alone is not a prompt-injection security boundary. Model
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
model, usage and digests while omitting private continuation material. The PostgreSQL store and replay wrapper below retain and recover that result.
Tests exercise all seven roles, cross-scope/policy rejection before reservation,
budget exhaustion, malformed output, refusal, cancellation and accounting failure.
These fixture tests prove control flow, not live upstream quality or compatibility.

## Adversarial regression corpus

`evals/agentci-reviewers.yaml` freezes twenty-two assertions across six scenarios:
identity policy, context isolation, budgeted execution, adversarial output and
result integrity and snapshot context.
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

## Context from authorized snapshots

`createSnapshotReviewContext(authorizedSubject, readSnapshot)` binds a subject
already authenticated by the controller. In the GitHub integration, supply
`createRemoteSnapshotReader(installationClient)` as the reader; it verifies exact
commit, tree and blob identities. This does not authenticate a caller by itself.
The loader accepts only source/requirement references, reads the bound base/head
commits, checks the returned SHA and copies only selected files into bounded context.
It cannot accept supplied document bytes or arbitrary diff text. Missing, oversized
or unsafe references fail; nothing is silently truncated. Selected paths remain
untrusted data and explicit selection does not imply complete review coverage.

Selection and subject are detached before awaiting I/O. Cancellation prevents
subsequent reads and result delivery; it does not interrupt an already active
reader request, which retains the GitHub client's 30-second timeout. Reader failures
are redacted. Unit and frozen-corpus assertions cover exact read identity, mutation,
missing/oversized files, invalid selection and cancellation. Customer workflow
wiring and authenticated provenance receipt handling remain in M3-07.

## Storage failure acceptance

`tests/reviewer-storage-failure.test.ts` injects connection, query and rollback
failures at the pool boundary. Unavailable storage cannot leak raw database errors;
rollback failure discards the connection. Corrupt evidence is a distinct immutable
conflict, and invalid request IDs never connect. These tests supplement the real
PostgreSQL integration tests; they do not substitute for database execution.

## M3-05 acceptance audit

This audit separates the internal task from the M3 customer release. All mapped
requirements remain in-progress until the outstanding hosted acceptance is retained.

| Requirement | Implemented behavior | Direct evidence | Remaining |
| --- | --- | --- | --- |
| SPEC-12.1-001 | Controller chooses role, provider, model, parameters and response schema; execution binds configuration/prompt/context digests | reviewer-context and reviewer-execute tests; versioned result fixture | Hosted corpus acceptance |
| SPEC-12.1-002 | Specification compliance role | reviewer-policy role inventory and all-role execution test | Hosted corpus acceptance |
| SPEC-12.1-003 | Code correctness role | Same all-role execution test | Hosted corpus acceptance |
| SPEC-12.1-004 | Architecture role | Same all-role execution test | Hosted corpus acceptance |
| SPEC-12.1-005 | Security role | Same all-role execution test | Hosted corpus acceptance |
| SPEC-12.1-006 | Adversarial role | Same all-role execution test plus malicious output rejection | Hosted corpus acceptance |
| SPEC-12.1-007 | Test/eval completeness role | Same all-role execution test | Hosted corpus acceptance |
| SPEC-12.1-008 | Operational reliability role | Same all-role execution test | Hosted corpus acceptance |
| SPEC-12.2-001 | Different-upstream policy, no alias bypass, required exact-head coding provenance | reviewer-policy and reviewer-execute rejection tests before reservation | Authenticated customer wiring in M3-07; hosted corpus acceptance for internal boundary |

Full verification run 37346712236 passed for persistence source
`947eb7ba9633c41bdf3571ec0c32a579a9b0fe93`; its retained metrics record is
`delivery/runs/37346712236-attempt-1.json`. That run predates snapshot-context loading
and does not prove later changes. Snapshot loading has local fast, mutation and
installed-package acceptance; its exact-source hosted verification is separate.
Advisory runs 37343583080 and 37346708609 failed on GitHub HTTP 403, and their
failures are retained rather than counted as successful coverage.

M3-06 owns deduplication, lifecycle and reproduction. M3-07 owns customer/API/check
wiring and authenticated provenance handling. Their existence in the plan does not
prove them implemented. Original live-provider acceptance remains deferred under
`m3-live-validation-deferral.md`; fixture results do not satisfy that acceptance.

### Initial isolated hosted acceptance

Advisory run `37347757134`, artifact `11361766061`, independently verified with
`verifyHostedReport` and `verifyHostedComparison`, retained comparison
`5ff8e937-734a-458c-95ab-8f92ce066db0` for PR33 head
`86ba02689354b5411265ecce0ee3f7c62e10a90c` against base
`9e4f05498358d7cda1b6a8d4f95b97ad40516d6f`.
The reviewer unit `c441a304-7c67-4f0b-aa5c-debde2dafe00` completed all six scenarios
with no failed, skipped or error trials under runner
`sha256:50fc7d9dd91ca9b32653fc3efa5e93a17d44593c5dd7ec2434ffcde22f2ccf57`.
The complete comparison reports five units, two paired comparisons and no
coverage, selection or execution gaps. The added reviewer suite uses head
assertions: it is initial isolated acceptance, not a two-sided frozen-baseline
comparison. That distinction remains an open closure item. Later storage-failure
tests are not covered by this earlier source's hosted run.

[Retained initial acceptance](https://github.com/alimobrem/agentci/actions/runs/37347757134/artifacts/11361766061).

### Merged foundation

PR33 merged as `36e6944` after exact source
`af3853d2191ed0e17582b5ff45fcaba317e75eeb` passed full verification run
`37349098502` and isolated hosted comparison
`4a55a132-e16b-4ab7-ac1a-07fc640acbe9` from run `37348992741`, artifact
`11362072301`. The independently checked receipt is
`delivery/acceptance/m3-reviewer-merged-head.json`. The hosted result passed with
five units, two paired comparisons and no coverage, selection or execution gaps.
The reviewer suite was still new at that source. M3-05 therefore remains open
pending its first two-sided comparison using assertions frozen on merged main.
The next-task breakdown is in `m3-finding-pr-plan.md`; it does not advance M3-06.
