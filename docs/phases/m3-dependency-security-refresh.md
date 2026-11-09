# October 22 dependency security refresh

This bounded follow-up retains the failed PR117 attempts rather than treating the
earlier package proof as complete CI acceptance. Dashboard Verify `39824537004`
failed its dependency audit on Next `16.4.0`; Verify `39824536894` subsequently
failed the service-image scan on eval-worker's Docker CLI Go `1.26.9`
(`CVE-2026-111943`). Later runtime and combined-summary stages were skipped.

The owner approved both remedies and a merge gated on fresh CI and independent
review. Task `M3-dependency-security-refresh-20261022` tracks the change. The
existing candidate-package task remains separate, and all eighteen M3 release
gates remain pending. No release publication or customer activation is included.

## Dashboard

Next and `@next/env` are pinned to `16.4.2`. The lock retains the actual linked
root package identity and the framework's matching platform packages. `sharp`
is `0.35.5`, satisfying the patched framework's dependency constraint. Root
package versions, root package locks and unrelated dependency versions remain
unchanged.

The source record
[`m3-dashboard-next-source-16.4.2.json`](../../delivery/acceptance/m3-dashboard-next-source-16.4.2.json)
binds SHA512-verified npm archives, the immutable official release tag and the
actual installed handler. npm metadata does not supply a publisher `gitHead`;
the record identifies the verified release-tag source binding explicitly.
Exact shutdown version, handler hash and PID title remain mandatory, including
rejection of the old version/hash/title. Current positive fixtures are synthetic;
historical `16.4.0` receipts have not been rewritten.

Fourteen Next/env notice associations are reconciled against authentic archive,
source, lock and installed bytes. Unchanged notice assets are retained. This
does not establish complete notice coverage or legal clearance. Fresh native
inventories must report their actual residual qualifications independently.

## Evaluator CLI

The official Docker `29.9.2-cli` multi-platform image and both actual CLI binaries
are bound to exact digests, Docker source and compiled Go `1.26.10`. The CLI is
copied only into eval-worker. The existing source/vendor qualification remains:
a vendor manifest is not proof of the exact compiled dependency graph. Fresh
native acceptance must verify authentic LICENSE and NOTICE bytes in the final
image as well as the source.
The [Docker security phase record](m3-docker-cli-security.md) describes the exact
adoption evidence and preserves the earlier remedy as dated history.

The existing fixable HIGH/CRITICAL scan policy is unchanged. No finding is
suppressed, no trust store is changed, and no optional Podman adoption is inferred.

## Required acceptance

Standard Verify retains all integration, API, six-role scan, runtime and package
coverage, including separate extracted-root and consumer installation receipts.
Dashboard Verify must freshly pass its audit, types, units, standalone build,
browser and shutdown checks. The existing dashboard native matrix must retain
fresh AMD64/ARM64 source/image/lock/runtime/notice/scanner and owned-cleanup proof.
Each architecture retains all eight authenticated characterization cases (four
positive and four negative) and three authenticated signal cases, together with
the existing public-request and idle shutdown controls.

The nonpublishing eval-worker native matrix builds only eval-worker and its
eval-runner dependency on native AMD64/ARM64 runners. It retains unchanged scan
thresholds, actual native CLI provenance, evaluator runtime/isolation and explicit
owned cleanup, bound to the source, candidate, run and attempt. It uses repository
read permission and local image loading; it does not publish images.

Independent review of the exact final source and actual retained artifacts is
required before merge. Postmerge verification must bind the actual merged source
and distinguish any retained PR native proof from a fresh merged-source run.
Failed or incomplete cleanup remains unverified. Local feedback, full hosted CI
and native proof are separate results; no aggregate milestone acceptance follows.

Immutable dev.3/dev.4 artifacts, original M0–M10 requirements, candidate ARM64
package acceptance, live/provider/OIDC/browser/customer qualifications, historical
cleanup uncertainty, licensing gaps and existing service findings remain in scope.

Upstream references: [Next image-processing advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
[Next denial-of-service advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r),
and [Go vulnerability report](https://pkg.go.dev/vuln/GO-2026-6809).

## November merge preparation

New actual native scans reached vulnerability evaluation after the scratch fix.
They reported fixable undici findings and zip 8.5.1 in Temporal's Cargo source
manifest. The current official Temporal SDK 1.25.0 supplies zip 9.0.5. All four
SDK dependencies now use that release; installed Cargo metadata and both Linux
native binaries match the SHA512-verified official core-bridge distribution.
The source manifest still does not establish compiled dependency reachability.
Compatible undici 8.12.3 and fast-uri updates remove the HIGH npm audit blocker.
Root package locks remain identical. No scanner exception is introduced.

Typecheck, 27 focused provenance/native tests and both frozen released API
baselines pass. npm audit at the existing HIGH gate passes; minimatch retains a
moderate finding with a major-version fix, not a zero-findings claim. Full
native SDK/runtime/recovery, six-role scans, package installation and exact-source
hosted/independent review remain pending. See
`delivery/acceptance/m3-worker-dependency-security-local.json`. Earlier immutable
artifacts and failed attempts remain historical evidence, not new acceptance.

## Remaining optional engine tree

Verify 41881056363 passed both native evaluator architectures but stopped on
19 fixable HIGH/CRITICAL entries in eval-engines. Eval-agentci was not scanned;
late runtime/provenance stages were not accepted. The actual retained scans
remain historical failure evidence.

Promptfoo is now pinned to official current 0.125.1, with compatible Azure
identity/MSAL, body-parser and undici updates in its lock. Its complete installed
graph has no Forge dependency. The old backport fixtures and metadata remain
available; current runtime proof instead binds the exact lock and inspects the
actual package graph for nested or aliased Forge reintroduction. Helper code is
checksum-bound. Historical RSA fields are null with an explicit dependency-removal
reason, not passed. Rehashed forged receipts, wrong helper hashes, source/lock
substitution, nested/aliased packages and symbolic substitutions are rejected.
Historical receipt validation with original source pins remains unchanged.

Fourteen focused security/release tests, typecheck, workflow lint and installed
CLI version check pass. Optional-engine npm audit has zero HIGH/CRITICAL and six
moderate findings. Full Mac feedback remains failed (772 passed, eight failed,
six skipped). Fresh image, runtime/adapter, six-role scan and independent artifact
acceptance remain pending. See `delivery/acceptance/m3-promptfoo-security-local.json`.
No scanner policy, numerical evaluation gate or immutable release is changed.
