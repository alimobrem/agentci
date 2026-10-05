# M2 native dependency evidence (release pending)

The earlier combined-client evaluator packaged the official Podman 6.1.3 static
remote client and Docker 29.8.2 CLI in UBI. The owner subsequently approved a
Docker-only M2 release image, with Podman in a separate development target; see
[engine decision](../m2-container-engine.md). Findings below remain recorded for
that Podman client and are not exemptions. `deploy/security/native-components.json` pins their source and
binary identities, official release archive checksums, licenses and inventories.
Podman compiled inventories for amd64 and arm64 were extracted from the verified
release binaries with official Go 1.27.1 `go version -m`; each contains 133 modules.
The official Podman build metadata reports `vcs.modified=true` and module version
`v6.1.3+dirty`. These upstream values are preserved, alongside the exact release
asset hash and commit; the binaries are not represented as reproducible local
builds. The source `go.mod` includes modules outside the remote binary.

Native verification compares the actual packaged CLI binaries and inventories
against these pins, and verifies the Temporal core-bridge native artifacts against
the official npm package. It runs independently of the container engine and uses
the engine's own immutable image identity. It does not inventory the operator's
Podman server, prove the upstream binaries' full reproducibility, or establish the
absence of vulnerabilities. Cargo and Docker source manifests remain source
inventories, rather than exact compiled dependency graphs.

The actual arm64 evaluator scan recognizes the Podman binary's Go package graph
(135 packages, including main/runtime metadata), installed npm packages and the
Temporal Cargo lock. It detects `google.golang.org/grpc v1.82.1` with:

- CVE-2026-84304 (HIGH): receive-buffer memory exhaustion; see the
  [upstream advisory](https://github.com/grpc/grpc-go/security/advisories/GHSA-vp52-pcj8-j9qc).
- CVE-2026-84445 (HIGH): malformed requests panic an xDS-configured server; see
  the [upstream advisory](https://github.com/grpc/grpc-go/security/advisories/GHSA-2v4p-qf9q-27wj).
- CVE-2026-84303 (MEDIUM): xDS RBAC header normalization; see the
  [upstream advisory](https://github.com/grpc/grpc-go/security/advisories/GHSA-qc2q-p7wx-3px3).
- GO-2026-5932 (UNKNOWN): unmaintained `golang.org/x/crypto/openpgp`; see the
  [Go vulnerability entry](https://pkg.go.dev/vuln/GO-2026-5932).

These are retained findings, not exemptions. The two HIGH findings fail current
CI scan policy. Latest upstream Podman does not by itself dispose of them. Exact
binary analysis using official govulncheck 1.8.0 confirms affected gRPC symbols
are present in the arm64 release binary. Command-call-path assessment is in progress; no non-applicability
or patched-client claim is made. M2's native security gate stays open until findings
are resolved or concretely assessed with a documented release treatment, and both
published platforms have independent scan and runtime evidence. Promptfoo's
separate node-forge finding and reviewed backport also remain under release
assessment.

## Corrected release candidate evidence

The frozen `0.3.1-m2` product source is
`9bcff7d57c40536c9ddec126e998aa97bd045f03`. Its full source CI passed 135
unit/API/domain tests and fifteen mandatory integration groups with no skips;
see `releases/m2-corrected-final-source-ci.json`. Independent publication
verification in `releases/m2-four-role-publication.json` checks the official
archive hashes, anonymously reads content-addressed registry manifests/configs,
and binds both platform labels and scan reports to that source. At this checkpoint
API, worker, eval-worker and eval-runner are verified; the two remaining roles
and native downloaded runtime acceptance are pending. This is partial evidence,
not a passed milestone safety gate.

## node-forge downstream patch and maintenance

The optional Promptfoo engine retains the published package version `1.4.0`.
AgentCI applies the exact source change from upstream
[PR 1152](https://github.com/digitalbazaar/forge/pull/1152), pinned at
`ceba34402e329f0365134f23fe19898756527d65`. It rejects additional children in
the nested PKCS#1 v1.5 DigestAlgorithm structure. The before/after source hashes,
open/unmerged upstream status and replacement bytes are recorded in
`deploy/engines/patches/forge-backport.json`; the installed patched `rsa.js` hash
must be `acc22e5d36e27832c34e02dd3933aad7977d45b047eead5016520735efedc9c5`.
This is an AgentCI-maintained backport, not an upstream fixed release.

The official advisory and upstream PR recheck are retained in
`releases/m2-forge-official-source-recheck.json`. The advisory lists no fixed
upstream version at that checkpoint. Trivy's version-based HIGH finding is
retained in the source CI and will also be retained in published-platform scan
reports. No ignore rule, fabricated package version or clean-scan claim is used.

The acceptance workflow merged in PR #17 checks the actual anonymously downloaded
engine on native amd64 and arm64 runners. It compares installed RSA, metadata,
fixture and verifier hashes to the frozen release source, then executes the
shipped regression verifier. That verifier rejects the malformed nested structure,
accepts valid SHA-256 and SHA-512 RSA signatures, and rejects wrong messages.
These downloaded checks have not yet run; adding them is not remediation proof
for a published artifact. The malformed fixture uses skipped padding checks to
isolate the ASN.1 validation defect; it does not demonstrate a complete production
signature-forgery exploit or establish the safety of every forge call path.

AgentCI repository maintainers own this downstream patch. Before publishing an
engine update they must recheck the advisory and upstream PR, review changes to
the RSA validation source, verify pinned patch bytes and execute these crypto
compatibility/regression checks plus real Promptfoo and DeepEval integration on
both supported native platforms. A patch hash or regression failure blocks that
engine's release. Once upstream publishes a supported fix, replace the backport
with the verified upstream version and retain the regression and historical
scanner evidence. An affected shipped engine requires a new immutable release
and an explicit upgrade notice; existing image tags and assets must not be
rewritten. The final release disposition remains pending the published native
checks and complete platform inventory/scanner assessment.
