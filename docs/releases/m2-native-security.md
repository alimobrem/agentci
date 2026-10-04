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
