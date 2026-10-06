# Definition of done

This is the completion policy for new work and M1–M10 releases. The historical M0
release record describes the checks actually performed for that release; it must
not be rewritten to claim later gates or features were already verified.

## Three different completion claims

| Claim | Required meaning |
| --- | --- |
| Change complete | Agreed change implemented, appropriate checks passed, docs/status updated, and the intended branch/PR contains it |
| Milestone complete | All milestone acceptance criteria and applicable release gates below passed with recorded evidence |
| Product complete | Definition of initial build in spec section 49 met; a completed early milestone does not imply this |

Requirement statuses remain not-started, in-progress, implemented, tested, or
deferred. Implemented means code exists. Tested means relevant verification has
passed. Neither status substitutes for publication or the milestone release gate.

Use milestone states: not-started → in-progress → verifying → release-candidate →
published → complete. Use blocked with a specific unresolved dependency when
progress depends on external access or action. Publishing is not completion until
the published artifact checks pass.

## Mandatory release gates

| Gate | Pass condition | Evidence to record |
| --- | --- | --- |
| Scope | Every milestone build item and exit criterion mapped; no silent scope reduction | Requirement IDs, implementation paths, acceptance scenario |
| Correctness | Appropriate unit, integration, negative-path, and regression checks pass on the release source | Commands/run links, source SHA, passed/failed/skipped counts |
| API correctness | Changed interfaces pass the [API correctness gates](api-quality.md), including contract, behavior and compatibility verification | Contract revision, operation coverage, integration results and compatibility decision |
| Evals | Applicable deterministic/behavioral/adversarial cases meet defined thresholds | Corpus/suite revision, results, thresholds; explicit inapplicability reasons |
| Reproducibility | Clean checkout of release source installs locked dependencies, builds and verifies | Node/tool versions, lockfile, clean-build record |
| Runtime | The built CLI/services work from a production-dependency installation | Smoke results against compiled/package output, startup and failure behavior |
| Safety | Relevant dependency scans and trust-boundary tests pass; unresolved findings are assessed | Scan results, findings and disposition; regression evidence for defects |
| Documentation | Copyable quickstart, feature limits, configuration, operations and release notes match shipped behavior | Verified instructions, configuration example, recovery/upgrade guidance where applicable |
| Release identity | Source commit and immutable version/tag identify the tested build | Commit SHA, tag, build inputs, artifact checksums |
| Publication | Source/tag pushed; GitHub release and required assets available | Repository URL, release URL, asset URLs and version |
| Distribution | Downloaded release assets match manifest; installed download passes smoke checks | Downloaded checksums/digests and clean-install results |
| Demo | Give the user a working demo of what shipped and how it works, including an applicable failure case | Version/digest, reproducible steps or recording, observed outputs and limitations |
| Closure | Status and release evidence updated; intended source branch synced with remote | Completion record, remaining limitations and next milestone |

CI runs on the intended release source are required for M1 onward. Preserve run
links and machine-readable results where available. Local success alone does not
prove CI or distribution success. Do not count a previous SHA's checks as evidence
for changed behavior; rerun the checks affected by the change.

## Deployable service gates

For each service introduced by the milestone, also require a versioned OCI image,
startup/health and applicable integration smoke tests, vulnerability scan results,
registry publication, and a verified immutable digest. Record the image's source
commit, build inputs and supported platforms. Use the digest for deployment and
verification; a mutable image tag alone is insufficient.

Provide relevant configuration/secret references, shutdown behavior, persistence
and migration instructions, observability, upgrade/rollback instructions, and
access boundaries. Verify the deployment mode claimed by this milestone.
A sample local process does not prove a hosted, hybrid or OpenShift deployment.
M0's CLI/contracts scope does not require an image; M1's deployable API/worker
scope does. Container-image publication access must remain scoped to the intended
project/registry workflow.

## Customer and agent acceptance gates

The user added these gates after the original M1 release. They apply to the
customer-onboarding extension and future service milestones; historical release
evidence must not be rewritten to imply they were already tested.

- Customer onboarding: use the released package/images in a fresh repository,
  configure a repository-only App, process a real GitHub PR and retrieve usable
  evidence. Exercise an input failure and recovery. Record manual prerequisites
  and steps; mocks/local Git repositories do not substitute for live acceptance.
- Agent/API usage: run an executable client example against the deployed service,
  checking authentication failure, exact PR/base/head identity and evidence digest.
  Identify supported API operations and the limits of agent-driven orchestration.
- Missing external access leaves these gates pending; it cannot be labeled passed
  or inapplicable. The original App remains limited to alimobrem/agentci; the separately approved
  onboarding App remains limited to alimobrem/agentci-onboarding-demo.

## Blocking rules

- A failed or unrun applicable check blocks completion. Skipping is not passing.
- Infrastructure failure is not successful behavioral verification.
- Missing credentials, an empty remote repo, an unpublished release or unavailable
  assets mean the milestone remains open, subject only to the narrow external
  model-provider exception below.
- Deferred milestone exit criteria block completion. Product backlog items outside
  the milestone do not block that milestone; list them clearly. The approved
  external model-provider exception below is the sole named exception here.
- Inapplicable gates need a scope-based reason. Convenience, missing access or a
  broken environment are not inapplicability reasons.
- Unsupported model assertions remain unconfirmed; consensus alone is not evidence.
- Documentation-only follow-ups need appropriate doc checks and publication to the
  intended branch; they do not require rebuilding an unchanged released binary.
- Do not overwrite a released artifact or move a release tag to hide a correction.
  Publish a new version when the shipped package changes.
- Do not start the next milestone while the current milestone is verifying,
  blocked, a release candidate, or awaiting published-artifact verification.

## Approved external model-provider validation exception

The [M3 owner decision](phases/m3-live-validation-deferral.md#approved-progression-exception--2026-10-06)
permits inaccessible external model-provider validation to remain deferred/unverified
without blocking progress only after **all other applicable gates pass**. This is
not a generic exemption for missing credentials or deferred requirements. Preserve
the original requirement IDs and full M0–M10 scope for future resumption. Never
claim live provider compatibility, quality or independence passed on fixture evidence.

Implementation, internal fixtures, API/security checks, GitHub customer acceptance,
packaging, publication/download verification, release, delivered success/failure
demo and recovery remain mandatory. Final requirement audits and closure limitations
must identify the exact unverified portions and the approved decision. All release
gate statuses and evidence rules remain unchanged; report qualified completion
under the exception, never completion of the original live-provider validation.

## Completion record

Store the record at `docs/releases/<milestone>.md`, with checksums/digests and
machine-readable summaries under `releases/` or linked CI artifacts. Include:

```text
Milestone and version:
State:
Specification/requirement IDs:
Source commit and tag:
Acceptance scenario and observed result:
Tests/evals: source SHA, suite revision, results, skipped reasons:
Clean build and production-install smoke results:
CI/scan evidence:
Packages/images: URLs, checksums/digests, downloaded smoke results:
GitHub release URL:
Documentation verified:
User demo: steps/recording, observed success and failure behavior:
Exceptions, deferred work and limitations:
Remaining blockers:
Next milestone: not-started until current milestone is complete
```

The user-facing completion report must identify the release and evidence, state
material limitations, and say which milestone is next. Report partial progress as
partial progress. A test count alone cannot support a claim of complete.

At each milestone completion, present the demo to the user as part of the
completion report. Explain the inputs, observable behavior, and outputs in plain
language, with reproducible commands or a usable interface. Demonstrate the
milestone's acceptance scenario using the released build; identify anything
simulated. A local simulation cannot stand in for a live integration exit criterion.

## M1 retrospective before M2

After M1's release gates pass and the user receives the released-build demo,
conduct the [M1 retrospective](retrospectives/m1.md) with the user before starting
M2. Use recorded evidence to identify what worked, what caused delays or rework,
and which improvements will help the next phases. Record concrete actions with
owners, a target milestone and a measurable success criterion. Keep feedback-loop
speed separate from end-to-end delivery time; missing historical data stays
unknown. Carry agreed actions into the next milestone's task board and workflow.

## Automated completion record

Use `releases/m1-gates.json` and `npm run release:check -- --require-complete`
for the M1 gate record. The command rejects incomplete gate sets, pending checks,
missing evidence, changed file hashes and evidence for another release source.
CI supplies a source-identified evidence bundle. This validates the record's
integrity; it does not replace reviewing assertions or verifying external assets.
See [delivery workflow and measurement](delivery-workflow.md). Speed comparisons
never authorize skipping a mandatory phase gate.
