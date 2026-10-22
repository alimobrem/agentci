# October 22 optional Python security refresh

Task `M3-python-security-refresh-20261022` tracks the owner-approved update of
aiohttp `3.14.3` to `3.14.4` and certifi `2026.7.22` to `2026.10.19` in the
optional `eval-engines` image. Only those two requirement lines and their complete
official release-wheel hash sets change; the other 59 pins, CPython `3.14.8`,
UBI base, Dockerfile and npm/Promptfoo inputs remain unchanged. The existing
`--require-hashes --only-binary=:all:` install policy remains mandatory.

The [component record](../../deploy/security/python-engine-components.json)
binds the retained official metadata, selected AMD64/ARM64 wheel bytes, four
CPython-314 ELF extensions per platform, authentic notices and exact certifi
bundle. aiohttp `3.14.4` is the approved advisory-named minimum fix; it is not
claimed to be the latest release or free of all vulnerabilities. The existing
`yarl 1.25.1` satisfies the raised minimum without another dependency update.

The newly approved trust change affects the certifi package bundle under
`eval-engines` `/opt/python`: 121 anchors become 120, only emSign ECC Root CA-G3
is removed, and none are added. The other 120 certificate DER identities remain
unchanged. Chains depending exclusively on the removed anchor should cease
validating for callers using this bundle. No current workload or live endpoint
behavior has been tested. Mac, Node, UBI/OpenSSL system and global trust stores
are unchanged. aiohttp's default SSL context is not asserted to use certifi.

Unmodified aiohttp Apache/MIT, vendored llhttp MIT and certifi Mozilla/MPL notices
remain within the complete `/opt/python` copy. The certifi file is a 989-byte
notice with an MPL URL, not the full MPL text. This update does not establish
complete licensing, source-obligation or legal clearance.

Static wheel inspection is separate from installed-image evidence. The existing
offline engine integration now reads the actual installed versions, default-marker
dependency closure, four native modules and default C parser, metadata/notices,
and exact certifi bundle/anchor removal through its existing isolated runner.
An allowed pure-Python aiohttp wheel means `only-binary` alone cannot prove native
extension selection. Fresh current-source image builds, unchanged six-role scans,
real success/regression/import-error/cancellation tests, owned cleanup and bounded
nonpublishing native AMD64/ARM64 engine verification remain required. The current
worker/dashboard native workflows do not establish optional-engine acceptance.

All historical failed/skipped attempts, immutable dev.3/dev.4 artifacts and
original requirements remain preserved. Independent exact-head and actual-artifact
review, required CI and postmerge verification remain merge conditions. Neither
this source change nor its local checks complete a task criterion or any of the
eighteen pending M3 release gates.

Primary sources: [aiohttp release](https://github.com/aio-libs/aiohttp/releases/tag/v3.14.4),
[aiohttp release metadata](https://pypi.org/pypi/aiohttp/3.14.4/json),
[certifi release metadata](https://pypi.org/pypi/certifi/2026.10.19/json),
and [immutable certifi bundle source](https://github.com/certifi/python-certifi/blob/662df63d7906df66f1f07c0751a3dfe9da14d914/certifi/cacert.pem).
