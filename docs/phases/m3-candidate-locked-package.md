# Candidate package locks and installation proof

This change addresses the CI candidate archive assembled from the current checkout.
It does not publish or replace a release. Immutable dev.3 and dev.4 artifacts and
their download receipts remain unchanged.

Pinned npm 12.2.0 omits the root `package-lock.json` and `npm-shrinkwrap.json` from
ordinary `npm pack` output. Listing shrinkwrap in `package.json` does not restore
those bytes. A consumer `npm install` alone therefore does not prove that the
downloaded archive can install reproducibly as an extracted production root.

The shared package assembler preserves npm's selected files, adds both authentic
committed locks and exact source provenance in owned staging, and computes hashes
from the final archive. Verify builds explicitly and suppresses packaging
lifecycle scripts. The publication entry point retains its existing activation,
six-role image, immutable asset and native download requirements.

The candidate manifest binds checkout commit and tree, candidate head, version,
run and attempt, final archive checksum and complete member inventory. Unsafe,
duplicate, linked or substituted members and omitted or modified locks must be
rejected before installation.

Candidate acceptance verifies the final archive first, then records two separate
production installations: extracted-root `npm ci --omit=dev --no-audit --no-fund`
and consumer `npm install --omit=dev --no-audit --no-fund`. npm receives a fresh
HOME/cache, empty user/global configuration and a credential-free environment.
Dependency lifecycle/native setup follows the existing pinned install policy;
packaging lifecycle suppression does not claim that dependency scripts are off.
Existing installed PostgreSQL/Temporal readers and worker/recovery checks remain
separate from source-import integration tests. Failed stages and owned cleanup
outcomes are retained. Verification summary requires the current candidate's
archive, manifest and successful locked-root and consumer receipts.

Initial hosted proof is Linux AMD64. It does not establish candidate ARM64
installation, live provider/OIDC/browser/customer acceptance, legal clearance or
M3 completion. The older immutable dev.4 locked-root receipt cannot certify this
candidate. All original M0–M10 requirements and all eighteen M3 gates remain in
scope; historical failed attempts and unverified canceled-run cleanup remain
preserved. Independent exact-head review is required before merge, followed by
actual postmerge artifact and cleanup verification.
