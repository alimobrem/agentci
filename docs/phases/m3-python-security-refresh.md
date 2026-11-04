# Optional Python security follow-up

The retained PR #118 Verify artifact from run 39840879606 contains fixable HIGH or
CRITICAL findings in eval-engines for aiohttp 3.14.3 and certifi 2026.7.22. The
sixth role was not scanned; skipped runtime/provenance is not passing evidence.

This isolated preparation updates only the two hash-pinned Python dependencies:
[aiohttp 3.14.5](https://pypi.org/project/aiohttp/3.14.5/) and
[certifi 2026.10.23](https://pypi.org/project/certifi/2026.10.23/), the official
current stable releases observed during preparation. All other requirement pins,
base runner requirements, Node/runtime versions and root package locks stay
unchanged. The Docker build still requires hashes and binary distributions.

Actual official CPython 3.14 Linux AMD64/ARM64 aiohttp wheels and the platform-neutral
certifi wheel match their PyPI hashes and declared metadata. Wheel-only resolution
of the complete inherited Python environment passes for both target platforms;
it is not native import or DeepEval execution acceptance. The local source,
distribution and resolution record is
`delivery/acceptance/m3-python-security-refresh-local.json`.

Certifi's upstream CA bundle changes as part of the dependency upgrade; the new
wheel contains 118 certificates. No private CA, trust override or TLS bypass is
introduced. Live endpoint compatibility remains unverified. Packaging/notices,
actual native image imports, optional engine behavior, all six scans and
independent actual-artifact review remain required before acceptance.

Fresh scanner execution separately reports fixable undici findings and zip
entries in Temporal's Cargo source manifest. This Python update does not close
those findings or claim that the source manifest proves compiled reachability.
All original M0–M10 scope, historical evidence, immutable candidates and eighteen
pending M3 release gates remain intact. No release or customer activation occurs.
