# M3 Docker CLI security adoption

The October 11 PR73/74/75 Verify attempts stopped at the evaluator-worker scan:
CVE-2026-78667, CVE-2026-78669 and CVE-2026-97031 in Go stdlib1.26.8.
The owner approved adoption of the patched official Docker CLI/image and refreshed
provenance with unchanged security thresholds. Prior failures remain evidence.

Docker29.9.0 released October8 uses Go1.26.9. The multi-platform official image
is pinned by index digest; extracted amd64/arm64 binary hashes and upstream source
commit/vendor inventory bind the exact copied CLI. The immutable official-images
Dockerfile identifies the static Docker URLs. Those direct archive downloads
returned403 in this environment; binary identity was verified through the pinned
OCI images. Go metadata verifies compiler/platform/build flags; the official
GOPATH binary has no embedded module graph. Vendor metadata remains a source
inventory. Neither establishes exact compiled dependency coverage.

The amd64 CLI negotiated API1.51 with the local Docker28.4 engine. Architecture
metadata extraction is distinct from native arm64 service execution. Exact-source
hosted scans, container/runtime/native provenance and isolation acceptance are
required after publication; actual download-smoke workflow execution, customer
acceptance and M3 closure remain pending. Historical M2 release identities remain
in their existing records. No scan findings are waived or thresholds weakened.

Upstream sources:
- https://docs.docker.com/engine/release-notes/29/
- https://go.dev/doc/devel/release#go1.26.9
- https://raw.githubusercontent.com/docker-library/docker/623f4fd9a5abae2e72bda5c5d983bf9ff04a5a62/29/cli/Dockerfile
- https://github.com/docker/cli/tree/f415da838bed6a0e12ca6cb86ba198fdac6beb9c
