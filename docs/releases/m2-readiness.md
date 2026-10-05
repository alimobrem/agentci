# M2 release readiness

M2 `0.3.1-m2` is [published](https://github.com/alimobrem/agentci/releases/tag/v0.3.1-m2)
from `9bcff7d57c40536c9ddec126e998aa97bd045f03`. The [release and demo record](m2.md)
contains current evidence; `releases/m2-gates.json` governs final closure. M3 remains
not-started until all eighteen gates, the user demo and retrospective pass.

Verified: 135 unit/API/domain tests, fifteen native integration groups with zero
skips, compatibility and production package checks; all six UBI image roles on
AMD64 and ARM64; independently verified anonymous downloads and native runtime,
isolation/recovery and crypto remediation; all eleven public assets and clean
package installation; real customer CLI/client success, regression, cancelled
infrastructure attempt and same-head recovery preserving failed evidence.

The final scope audit covers every section 11 and M2 section 40 entry. Requirements
remain distinct from the complete product scope. The optional node-forge HIGH
scanner finding is retained with its pinned downstream backport and maintenance
obligation; [native security](m2-native-security.md) documents coverage limits.
Docker is the approved default. Podman adoption remains deferred with its original
findings and failed attempts preserved.

Final documentation/demo/retrospective and branch synchronization are tracked in
the closure change. See [the retrospective](../retrospectives/m2.md) for measured
publication bottlenecks and evidence-reuse improvements. No total delivery-speed
improvement is claimed from faster local checks.
