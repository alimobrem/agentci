# M3 native publication prerequisite

State: native publication and downloaded runtime acceptance verified for development
candidate `0.4.0-m3-dev.1`. Warm-cache comparison remains unmeasured. This is
M3-R1 infrastructure acceptance, not an M3 release claim.

The publication workflow verifies source first, then builds each of six image
roles on separate native AMD64 and ARM64 runners. Each role/platform has its own
BuildKit cache scope. Existing checksum-pinned Node/Python downloads, pinned UBI
base and lockfiles retain their cacheable runtime layers when application source
changes. This uses BuildKit layer reuse; it does not introduce an independently
released runtime base image or claim a measured speedup yet.

Builds push immutable digests without creating a version tag. Each native job
pulls its platform manifest, binds configuration architecture and OCI
source/version labels, scans that exact manifest, and retains native dependency
inventories for Temporal workers. Receipts bind role, architecture, source,
version, run and attempt to manifest/config digests and evidence checksums.
The merge job rejects missing, duplicate, failed, stale or mismatched receipts.
It validates a dry-run combined index before creating a version tag, then checks
the published index again and records its immutable digest. Existing version tags
and inconclusive registry responses still fail closed. Workflow concurrency
serializes publication of each candidate version; registry operators outside this
workflow must also respect immutable tags.

Build steps have a 40-minute cap within a 75-minute job, with 15 minutes for scans,
five for evidence upload and two for owned-builder cleanup. Cache export has a
two-minute bound. Automatic build-record upload and unbounded builder teardown
are replaced with explicit retained receipts/attempts and bounded cleanup.
Attempt metadata and any partial scan/inventory output upload even after failure.
A force-killed runner cannot guarantee final upload; Actions logs and already
pushed digests remain diagnostic evidence, never release acceptance.

Passing these publication receipts establishes identity, scan policy and worker
native inventory. It does not substitute for the existing full native downloaded
runtime/isolation/failure/recovery workflow on both architectures. No release or
M3-R1 completion may use this document as proof those runtime checks executed.

Validation implemented:

- Reject partial, duplicate, wrong-run/attempt/source/version, failed and missing
  evidence receipts before tag assembly.
- Reject substituted manifests and extra runtime platforms in the assembled index.
- Reject mismatched native image architecture and OCI identity labels.
- Reject scan evidence for another manifest, configuration digest or platform.
- Check that workflow ordering preserves evidence/cleanup time and forbids QEMU.

Observed acceptance is retained in
`delivery/acceptance/m3-r1-native-downloads.json` and
`delivery/acceptance/m3-r1-publication-failures.json`. Publication run 37265297310
built all twelve native images and assembled six indices. Download run 37267522445
anonymously exercised the same digests, all fifteen integration groups per platform,
API/worker startup, evaluator isolation/recovery, official Temporal native artifact
provenance and RSA patch regressions. The optional-engine node-forge HIGH finding
remains visible; the downstream patch checks do not constitute a clean scan.

The actual preparation command rejected missing platform evidence and changed scan
bytes without emitting assembly inputs. The workflow's failure-recording command
retained a failed build outcome with no digest. Remote runner loss/upload failures
were not injected; the limits described above still apply.

All twelve native build steps reported no reused BuildKit layers. The longest
publication job took 661 seconds, within its 4500-second limit; per-job build/scan
and timeout margins are recorded. These are cold native observations, not a matched
warm-cache comparison. Warm reuse will be measured on the next necessary candidate,
without republishing unchanged artifacts solely for timing. Preserve M2's failed
QEMU attempt and successful publication as historical cohorts; do not infer total
development acceleration from a shorter build.

The newly introduced artifact download action is pinned to official stable
`actions/download-artifact` v8.0.1, commit
`3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`, verified through the official GitHub
release and commit APIs during implementation. Its bundled runtime is Node 24,
separate from the application's pinned Node 26.10.0 runtime.

References: [Docker multi-platform builds](https://docs.docker.com/build/ci/github-actions/multi-platform/),
[GitHub hosted runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[artifact action release](https://github.com/actions/download-artifact/releases/tag/v8.0.1).
