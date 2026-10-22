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

## Later October 22 Python approval

The earlier statement that no trust store changes describes the Next/Docker
remedy above. The owner subsequently approved two optional Python pins and the
limited certifi package-bundle change. The
[separate Python refresh](m3-python-security-refresh.md) records its exact anchor,
wheel, notice and runtime scope. It does not alter Mac or other system trust,
rewrite historical acceptance, or close any M3 gate.
