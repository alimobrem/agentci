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


## October 22 follow-up

Verify run `39824536894` stopped at a new fixable HIGH finding,
`CVE-2026-111943`, in the copied Docker CLI's Go stdlib 1.26.9. Its retained
AMD64 scan is the failure record; the remaining three role scans and subsequent
compiled/native/evaluator runtime checks were skipped. The earlier checkpoint
above remains dated historical evidence.

The owner approved including this Docker CLI remediation with the dependency
refresh. The source now pins the official Docker CLI 29.9.2 index
`sha256:5e6baf67325a79f64ed3bed6863954d5e05d0f3d4e57cbdb14809346814bbfdb`.
Anonymous registry bytes, both platform manifests/configs and all image layers
were verified against their digests. Offline ELF build-info inspection of the
actual final-image AMD64 and ARM64 CLI bytes identifies version 29.9.2, source
build `a82e528` and Go 1.26.10. The official Go advisory lists 1.26.10 as fixed
for this CVE; this byte inspection does not replace fresh image scans or runtime
acceptance.

The CLI tag resolves to full source commit
`a82e528901260c8df6073311379eac65f92db204`. The source/vendor/build files and
LICENSE/NOTICE match immutable upstream Git blobs; the unchanged Apache license
and authentic NOTICE ship with the copied CLI. Vendor metadata remains a source
inventory because these official binaries expose no embedded module dependency
graph. Complete dependency notice/legal assessment remains separate.

The new local provenance record is
[`m3-docker-cli-security-20261022-local.json`](../../delivery/acceptance/m3-docker-cli-security-20261022-local.json).
Candidate binaries were retained as non-executable data and were never invoked
on the Mac. No Mac Docker access, publication, release replacement or customer
activation was used. Fresh exact-source six-role scans, native AMD64/ARM64
provenance and real evaluator isolation/runtime/cleanup, independent artifact
review and postmerge verification remain required. Immutable dev.3/dev.4 and all
eighteen M3 gates remain unchanged.

Additional primary sources:
- https://pkg.go.dev/vuln/GO-2026-6809
- https://raw.githubusercontent.com/docker-library/docker/a44773e1e79648f9fd7ebb7cb5cc00387dc05de0/29/cli/Dockerfile
- https://github.com/docker/cli/tree/a82e528901260c8df6073311379eac65f92db204
