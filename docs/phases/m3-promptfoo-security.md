# M3-R1-security-1: optional evaluator dependency security

PR55 Verify [37404082498](https://github.com/alimobrem/agentci/actions/runs/37404082498)
failed the unchanged scan gate. Artifact
[11386399646](https://github.com/alimobrem/agentci/actions/runs/37404082498/artifacts/11386399646)
retains four newly fixable findings in the optional evaluator image. The compiled
container, native provenance and evaluator-worker runtime gates were skipped
following that failure; neither the artifact nor this fix retroactively passes them.

## Upstream selection

The official npm registry and upstream GitHub releases were checked on
2026-10-06. [Promptfoo 0.124.0](https://github.com/promptfoo/promptfoo/releases/tag/0.124.0)
is a stable release published at 01:09:20 UTC, requiring Node >=22.22.0 and
`simple-git ^4.0.2`. AgentCI uses Node 26.10.0.
[Simple Git 4.0.2](https://github.com/steveukx/git-js/releases/tag/simple-git@4.0.2)
pins `@simple-git/argv-parser 2.0.1`. The standalone lock resolves those exact
versions, so no additional Git-library overrides are necessary. The existing
`basic-ftp 6.2.1` override and checksum-bound forge backport remain unchanged.

| Finding | Previous package | Upstream fixed version | Selected version |
| --- | --- | --- | --- |
| [CVE-2026-102826](https://github.com/steveukx/git-js/security/advisories/GHSA-g4wm-2vf7-vfgr) | simple-git 3.36.0 | 4.0.0 | 4.0.2 |
| [CVE-2026-102827](https://github.com/steveukx/git-js/security/advisories/GHSA-858h-whjf-mvg5) | simple-git 3.36.0 | 4.0.0 | 4.0.2 |
| [CVE-2026-102828](https://github.com/steveukx/git-js/security/advisories/GHSA-x6jw-m9v5-85vh) | simple-git 3.36.0 | 4.0.1 | 4.0.2 |
| [CVE-2026-102829](https://github.com/steveukx/git-js/security/advisories/GHSA-v5rq-49vh-5v5c) | argv-parser 1.1.1 | 2.0.1 | 2.0.1 |

The failure's scanner assigned CRITICAL to 102828/102829 and HIGH to
102826/102827. Upstream advisory labels differ in places; both identify the
patched package versions. No severity exception or scan threshold was changed.

Promptfoo 0.124.0 makes several provider SDKs explicit installs and removes the
hosted ChatKit provider. AgentCI's tested adapter uses the exec provider and its
structured report; this update does not promise that every optional upstream
provider is bundled. The lock removes 290 package entries and adds/updates 27.

## Installed licenses

Promptfoo, simple-git and argv-parser have installed MIT license files. Changed
lock entries retain declared licenses; this does not mean the whole optional
image is MIT. The already-present optional Claude Agent SDK retains its Anthropic
legal terms; this update does not grant different rights or invoke that SDK.

The new optional `@modelcontextprotocol/server-filesystem 2026.8.31` package
references a LICENSE file absent from its published tarball. Its README says MIT,
but the authoritative LICENSE at npm's gitHead
[`a40bc270fb5ece62673f8a1196f57116d885c5eb`](https://github.com/modelcontextprotocol/servers/blob/a40bc270fb5ece62673f8a1196f57116d885c5eb/LICENSE)
describes an MIT/Apache-2.0 transition and CC-BY-4.0 documentation. The exact
upstream notice is retained at `deploy/engines/licenses/mcp-server-filesystem-LICENSE`
and copied into `/licenses/mcp-server-filesystem-LICENSE` in the optional image.
No extra service is enabled by retaining this notice.

## Acceptance boundaries

See [the local acceptance record](../../delivery/acceptance/m3-promptfoo-security-local.json)
for the immutable ARM64 image identity, dependency versions, scan hashes and test
results. The real isolated evaluator test covers Promptfoo success, assertion
failure and missing-provider error reports, DeepEval success/failure/import
errors, cancellation cleanup and the forge backport regression. It makes no paid
provider calls and uses no customer credentials.

The final image scan must retain the existing `node-forge 1.4.0`
CVE-2026-85393 HIGH/no-upstream-fixed-version finding and its documented backport
assessment. A scan gate pass means no fixable HIGH/CRITICAL findings, not zero
findings. Local ARM64 acceptance does not replace hosted AMD64, native publication,
registry download or phase release gates. The task stays open pending publication.
