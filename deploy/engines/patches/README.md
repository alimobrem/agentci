# node-forge RSA backport

The optional engine retains Promptfoo's complete dependency tree and provider
capabilities. `node-forge` 1.4.0 is the latest published registry version checked
2026-10-04. GHSA-86w9-cpqp-85rv has no published fixed version. We apply the exact
RSA source change proposed in [upstream PR 1152](https://github.com/digitalbazaar/forge/pull/1152),
pinned at `ceba34402e329f0365134f23fe19898756527d65`. That PR is open and unmerged;
this is an AgentCI-maintained downstream backport, not an official forge release.

`forge-backport.json` records original and fixed whole-file SHA256 values. The
build refuses an unexpected package/version, altered original file, ambiguous
patch anchor or a result differing from pinned upstream source. Package version
and lockfiles remain 1.4.0. The installed dependency's BSD-3-Clause/GPL-2.0
license notices remain present; the upstream change and public regression fixture
retain their source attribution here and in the metadata.

The upstream RSA suite against published 1.4.0 fails its new nested
DigestAlgorithm regression: 100 passes, one failure and four upstream pending
cases. The byte-identical patched file yields 101 passes, zero failures and the
same four pending cases. These results cover the RSA suite, not the whole forge
repository or every provider integration.

The image build and mandatory real-engine integration run the public malformed
fixture against installed code and verify its whole-file hash. Native Node crypto
also creates valid SHA-256/SHA-512 signatures; forge must accept them and reject
wrong messages. Real Promptfoo/DeepEval pass, regression, infrastructure failure
and cleanup tests remain required on each claimed image platform.

Scanners may still report the upstream 1.4.0 advisory. Preserve that inventory and
bind downstream remediation evidence to the actual image digest. Do not relabel
the package as 1.4.1, hide the finding or describe the upstream inventory as clean.
This backport alone does not close M2's security or release gate.

On an official fixed release, update the dependency lock through normal review,
remove this backport only after re-running malicious-input and valid-signature
regressions, and re-scan/retest both claimed platforms. An unexpected version or
source checksum makes the current build fail so an upgrade cannot silently lose
the patch.

Sources: [advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
[upstream RSA fix](https://github.com/digitalbazaar/forge/blob/ceba34402e329f0365134f23fe19898756527d65/lib/rsa.js),
[public RSA regression](https://github.com/digitalbazaar/forge/blob/ceba34402e329f0365134f23fe19898756527d65/tests/unit/rsa.js).
