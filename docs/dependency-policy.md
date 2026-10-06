# Dependency version policy

Use the latest released stable versions at initial adoption and at each milestone
release. Include major updates when compatibility checks pass. Avoid prereleases
unless a specific requirement needs them. Latest is a selection policy; committed
lockfiles, image digests and action commit IDs make each selected build repeatable.
Future fixes and security updates remain necessary even when starting current.

The 2026-10-03 M1 release uses Node.js 26.10.0 (Current), npm 12.2.0,
TypeScript 7.0.2 and PostgreSQL 18.6. Direct npm dependencies were checked against
the registry's `latest` distribution tags. Temporal and Octokit were already
current. GitHub Actions were refreshed to their latest released tags and pinned
to those tags' commit IDs. Trivy 0.75.0 and the Temporal development image were
already at the current registry digests.

Red Hat does not publish `ubi9/nodejs-26-minimal` at this verification date.
The service images therefore use digest-pinned UBI 10 minimal and the official
Node.js 26.10.0 Linux binaries, with separate SHA-256 checksums for amd64 and arm64.
This is an AgentCI-maintained Node runtime on UBI, not Red Hat's Node.js image.
Check the Node archive checksums and update both architectures together.
Node 26 is Current rather than LTS at this date; test Temporal's native worker,
workflow replay and shutdown before accepting a runtime update.

Before closing a milestone, check npm's latest tags, Node releases, container
manifests and action releases again. Record any exception and its compatibility
reason. Changes must pass API contracts, tests, evals, clean production packaging,
real PostgreSQL/Temporal integration, image scans and container smoke checks.
Use a database migration plan for major database upgrades; never repoint an old
volume at a new database major version and call that a migration.

The source/container builds use `package-lock.json`. Keep its compatibility copy
`npm-shrinkwrap.json` synchronized for npm consumers that support shrinkwrap.
npm 12 no longer offers the shrinkwrap command; ordinary consumer installation
must not be described as a universally locked build across npm versions.
Released service images are the deployment artifact with locked dependencies.

Sources: [Node releases](https://nodejs.org/dist/index.json),
[Node 26.10.0 checksums](https://nodejs.org/dist/v26.10.0/SHASUMS256.txt),
[UBI images](https://catalog.redhat.com/en/software/containers/search),
[PostgreSQL container layout](https://github.com/docker-library/postgres),
[npm CLI releases](https://github.com/npm/cli/releases).

M2's optional engine image adopts Promptfoo 0.123.1 and DeepEval 4.2.8 from the
official npm/PyPI registries. Promptfoo's compatible `basic-ftp` override pins
6.2.1 to fix the upstream advisory; its real execution tests verify compatibility.
DeepEval's stable OpenTelemetry SDK requires the upstream `0.66b0` semantic
conventions package. This transitive prerelease-numbered package is an explicit
upstream compatibility exception, not a prerelease engine selection.
The scanner still reports the upstream node-forge 1.4.0 HIGH advisory. The M2
release applies a checksum-bound downstream RSA backport and records its native
regression tests and maintenance obligations in
[the native security assessment](releases/m2-native-security.md). Do not describe
the optional image as having zero findings or the backport as an upstream release.
The earlier local adoption records remain in
`releases/m2-optional-engine-dependencies.json` and
`releases/m2-optional-engines-local.json`; final publication and verification
evidence is recorded in [the M2 release record](releases/m2.md).

M3 updates the optional engine to stable Promptfoo 0.124.0, resolving simple-git
4.0.2 and argv-parser 2.0.1 for four newly fixable Git dependency advisories.
The existing forge backport and unresolved scanner finding remain. Upstream
compatibility changes, installed license notices and local image evidence are
recorded in [the M3 evaluator security assessment](phases/m3-promptfoo-security.md).
