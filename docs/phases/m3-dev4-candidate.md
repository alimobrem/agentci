# Corrected M3 development candidate dev.4

The owner approved the dispatcher correction, a distinct development candidate,
all six images, anonymous native download verification and the same customer
acceptance scenarios: proposal `Sentinel_52f8e53da6b08191b79f041275b8a149`, reply
`Sentinel_191ed7cd94a881919f5d46a5e2b2acb4` (2026-10-14 19:05 UTC, “yes”).
No new credentials, access permissions, paid or persistent services are authorized.

PR #100 was independently reviewed at
`48e621f80c13b7e33fd9a181ad6ca3e449057794`, tree
`8cbff5841c57a49eb3c6a3fdb2ce99c97dba925c`, and merged as
`adf66a6033a4c2d81c43d40cb8f66da255095e5f`. Its data-only dispatcher binding,
owned shutdown, terminal-status recovery and cancelled-before-child evidence
corrections are inherited without additional runtime or contract changes here.
The original hosted failure's initiating exception and prior cleanup state remain
unknown; separately reproduced inspection and dispatcher defects do not recover it.

This preparation selects **0.4.0-m3-dev.4**. Package/runtime identity, both equal
lockfiles, development publication workflow/descriptor, opt-in overlays and trusted
customer download helpers use the new version. Released base deployment remains
M2. Existing dev.3 release/tag/assets and historical acceptance records stay
unchanged. The customer activation descriptor remains bound to its historical
candidate until dev.4 publication and download verification succeed.

The publication contract is unchanged: authenticated destination preflight fails
closed on occupied or inconclusive package/tag/image identities; all six roles
(`api`, `worker`, `eval-worker`, `eval-runner`, `eval-engines`, `eval-agentci`) require
native AMD64/ARM64 build, runtime, vulnerability/provenance and immutable digest
evidence. Exact-source package, manifest, image manifest, evidence archive and
checksums are published as a new prerelease. Both native cohorts must anonymously
download and verify package/image bytes and pass the existing installed/runtime
acceptance before verified notes. Existing disclosed vulnerability qualifications
remain; a new version does not dispose of a finding.

The exact preparation PR head/tree, full source CI and independently inspected
actual artifacts must pass review **before merging this descriptor**. Its main
push triggers the existing publication workflow; merge is therefore the publication
activation, not an inert metadata change. The final publication source is that
exact reviewed preparation merge commit; it is not known until merge, and no
package/image digest is invented beforehand. A failed or partial publication
retains attempt evidence and occupied identities; do not overwrite or relabel them.

After native anonymous download acceptance and independent evidence review, bind
the customer activation to the actual candidate source and four asset hashes in a
separate reviewed change, then rerun the original four customer scenarios with
unchanged App scope and exact PR4/PR5 subjects. Customer success/failure/recovery,
dashboard, and all aggregate M3 publication/demo/release gates remain separate.
This candidate is not the final M3 milestone release and does not close M3 or
advance M4. Preserve full M0–M10 order, all three adapters and observed-rate
calibration; only the agreed inaccessible external-provider exception applies.

## Scanner fixture rework before publication

Verify `38622670778` attempt 1 at preparation head
`a9afe24d141cb3dad6d0629d233bbf3143320d6d` failed before runtime, integration
and package gates: one of 558 unit tests expected a finding for generated JSON
`package-lock.json` password data. The independent fast-feedback job, dedicated
scan, dashboard and advisory passed. The failed attempt and partial verification
artifact remain retained; those passing checks do not replace full Verify.

The custom password-assignment rule does not match a quoted JSON key. Detection
of that example depends on the pinned upstream generic rule's entropy and
stopword heuristics, which unconstrained random hex does not always satisfy.
Controlled actual-scanner probes reproduce both a below-threshold miss and an
above-threshold stopword miss while the same values in assignment syntax are
detected. The original hosted random value was intentionally not retained, so
which predicate rejected it remains unknown. This fixture assumption is separate
from the candidate's version changes and the earlier customer failure.

Keep the generated JSON password and add a credentialed `resolved` URL; assert
the exact existing non-entropy URL rule on that exact lockfile path. A digit
prefix excludes the pinned repeated-letter global allowlist. Additional actual
CLI cases verify both low-entropy and stopword values in the otherwise excluded
lockfile and `.gitleaks.toml` paths. Original intermediate add/delete, binary
blob/private-key, inline/repository-config bypass, redaction, divergent-head,
path-conditioned and fail-closed coverage checks remain. Scanner wrapper, policy,
tool/upstream pins, limits and negative-test gates are unchanged. Exact changed
head full CI and independent review still precede publication activation.
