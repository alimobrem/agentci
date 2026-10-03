# Dependency version policy

Use the latest released stable versions at initial adoption and at each milestone
release. Include major updates when compatibility checks pass. Avoid prereleases
unless a specific requirement needs them. Latest is a selection policy; committed
lockfiles, image digests and action commit IDs make each selected build repeatable.
Future fixes and security updates remain necessary even when starting current.

On 2026-10-03 the candidate uses Node.js 26.10.0 (Current), npm 12.2.0,
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
