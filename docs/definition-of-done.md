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

## Blocking rules

- A failed or unrun applicable check blocks completion. Skipping is not passing.
- Infrastructure failure is not successful behavioral verification.
- Missing credentials, an empty remote repo, an unpublished release or unavailable
  assets mean the milestone remains open.
- Deferred milestone exit criteria block completion. Product backlog items outside
  the milestone do not block that milestone; list them clearly.
- Inapplicable gates need a scope-based reason. Convenience, missing access or a
  broken environment are not inapplicability reasons.
- Unsupported model assertions remain unconfirmed; consensus alone is not evidence.
- Documentation-only follow-ups need appropriate doc checks and publication to the
  intended branch; they do not require rebuilding an unchanged released binary.
- Do not overwrite a released artifact or move a release tag to hide a correction.
  Publish a new version when the shipped package changes.
- Do not start the next milestone while the current milestone is verifying,
  blocked, a release candidate, or awaiting published-artifact verification.

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
Exceptions, deferred work and limitations:
Remaining blockers:
Next milestone: not-started until current milestone is complete
```

The user-facing completion report must identify the release and evidence, state
material limitations, and say which milestone is next. Report partial progress as
partial progress. A test count alone cannot support a claim of complete.
