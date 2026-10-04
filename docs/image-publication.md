# M2 image publication

The image publisher is release infrastructure under development. Its presence does
not mean M2 is released or any new image has passed customer acceptance.

After Verify passes, `.github/workflows/images.yaml` publishes six roles from one
selected source revision: `api`, `worker`, `eval-worker`, `eval-runner`,
`eval-engines`, and `eval-agentci`. Every role has a linux/amd64 and linux/arm64
manifest, source/version labels, and a retained identity containing its immutable
index digest, source commit, workflow run and attempt. Service stages use UBI.

Dispatch the workflow on the intended release source with `version` matching
`package.json`. Use a new candidate version. The authenticated registry preflight
permits only explicit manifest absence (404); existing tags and inconclusive
network/authorization responses stop publication. Workflow concurrency serializes
runs for the same version. This is a workflow overwrite guard, not registry-enforced
immutability: other registry writers can still move a tag. Deploy and verify by
digest. If a run partially publishes roles, choose a new version for a corrected
candidate rather than overwriting published artifacts. Do not move release tags.

Each matrix job retains `published-images-ROLE`, containing identity, both platform
scan reports, and worker/eval-worker native inventories. Fixable HIGH/CRITICAL
findings fail the existing scan policy. Unfixed findings still require an explicit
reviewed disposition in the release evidence. Cache export is optional; builds,
scans, native input verification and evidence checks remain mandatory. Native
inventories are checked against pinned upstream artifacts and the requested
platform. Arm64 inventory execution on the publisher uses QEMU; it proves artifact
identity, not native-arm64 runtime/integration acceptance.

Before a release is complete, independently download each public image anonymously
by its recorded digest, validate source/version/platform identity, and execute the
applicable startup, isolation, integration and failure/recovery checks on each
claimed platform. Retain the actual engine, host architecture and any emulation.
The existing M1 download-smoke workflow covers API/worker only; extending it to all
M2 images and native platform acceptance remains required work. Likewise, this
publisher does not create the GitHub release, CLI archive, checksums, configuration
examples or user demo. Follow [definition of done](definition-of-done.md) and the
[M2 readiness record](releases/m2-readiness.md) for those gates.
