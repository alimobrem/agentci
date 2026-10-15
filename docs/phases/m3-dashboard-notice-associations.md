# Dashboard package notice associations

This correction changes notice collection only. Dependencies, installed package manifests,
release candidates and licensing decisions remain unchanged. The historical native inventory
from run38667312203 (22 unresolved metadata items) remains original evidence.

`dashboard-notice-associations.mjs` applies only the reviewed recipes in
`scripts/dashboard-notices/associations.json`. Each recipe binds the exact installed and
runtime package manifests, named owner manifest, lockfile archive URL/integrity,
canonical installed source file tree and every retained runtime file. A source, runtime,
identity, lock or notice-byte mismatch fails collection. No package code is executed.
The inventory retains `rawMetadataIssues` and original `declaredLicense`, then records
`noticeEvidence` and `noticeAssociations` separately. Associated declarations describe
explicit package-specific evidence; they do not rewrite missing SPDX fields.

Authentic notice bytes, hashes, exact package archive integrity and immutable upstream
build/source URLs are retained for review. This includes existing compiled busboy,
ignore-loader and querystring-es3 MIT notices; the exact Terser5.51.2 CommonJS descriptor;
Next16.4.0 env/font code provenance; component-specific README notices/waivers for
constants-browserify1.0.0 and string-hash1.1.3; and release-bound notices for data-uri-to-buffer,
proxy agents, punycode, setimmediate and Edge Runtime cookies/ponyfill. Proxy-agent embedded
agent-base/once notices are retained separately, with debug's external boundary explicit.
Some associations use exact official Next build/lock provenance; no independent ncc rebuild
is claimed. Next's notice does not substitute for its bundled dependencies' notices.

The libvips1.3.4 recipes are architecture-specific Linux x64/ARM64 archives. Each retains
the complete upstream README Licensing matrix, binary/package source tree, `versions.json`
hash and build version/packaging provenance. Upstream `generate_readme` copies the
third-party notices into README and `remove_unused` removes the old notice file. This is
an explicit allowlist, not generic README discovery. Native redistribution, source-offer,
compatibility and applicability decisions remain pending. The matrix and its links do not
establish full per-component copyright/license texts; structured `licensingReviewItems`
retain native notice-completeness and source-obligation unknowns separately from metadata.

The preserved Mac standalone replay observed209 packages,331 directly discovered notices,
15 matching associations and20 associated notices, including separate dotenv and dotenv-expand BSD notices.
It retained seven metadata items: client-only, babel-packages (two), Unistore,
@nodable/entities and Mac-specific libvips/esbuild notices. These are local observations,
not native Linux acceptance. Both Linux architectures must regenerate their own inventories;
the expected Linux residual is five metadata items (babel-packages two, client-only,
@nodable/entities, Unistore), and only actual CI can establish final counts.

Unresolved provenance stays explicit: babel-packages needs actual component enumeration;
client-only has no verified authentic package notice; @nodable/entities shipped3.1.0 has
not been bound to the visible3.0.0 source; Unistore3.4.1's exact published archive and
registry-bound commit have no full package-specific notice (a license link alone is not
substituted with generated text). Recovered notices are not legal clearance.

Focused regressions cover unchanged metadata with changed code, lock/archive/version and
owner drift, changed notice bytes, unlisted packages, absent owners and source links.
Existing native qualification remains load-only/push-false with the same bounded public
artifact publisher (32MiB), privacy/UID/isolation/scan/shutdown checks and owned cleanup.
Both existing native runners are triggered by collector assets. All18 M3 aggregate gates,
live OIDC/HTTPS acceptance and native active-request drain remain pending/unverified.

Local validation:34 focused packaging/notice/native-evidence/public-artifact regressions pass and root typecheck passes.
The required final `check:fast` ran all10 stages: nine pass; root tests report617 total,
602 pass,9 existing Mac/native-process or native-Linux/reporter failures,6 skip.
The first check attempt also exposed a new test import/type annotation error; that error
was fixed and the final type stage passes. Both attempt logs remain local evidence.
This local feedback does not waive hosted full CI, actual native inventories or independent
review. The task remains in progress with hosted/reviewer acceptance pending.

Initial draft head3a99286 Verify38673132335 attempt1 passed hosted fast feedback, then
failed the canonical reconciliation check. The accepted evidence document's validation
counts changed after snapshot generation, so its stored hash was stale. The initial
tracked-file hypothesis was incorrect: the generator reads evidence bytes directly.
The normal follow-up regenerates snapshots after all documentation/task edits and checks
consistency before publication. The failed attempt remains in
`delivery/runs/38673132335-attempt-1.json`; initial native jobs are left running.

The draft normally merges independently accepted dashboard evidence views from main
b07702dc2f48f32bbbcc3717132b8b5e9fbca6d7. Three-way task reconciliation preserves
all entries and distinct events from both branches; canonical output retains all1346
source requirements,171 tasks and18 pending aggregate gates. Collector/runtime recipes
and dependency versions are unchanged by this merge. Fresh exact-head CI and independent
actual native artifact review remain required before merge.
