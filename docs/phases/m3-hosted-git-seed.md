# Hosted snapshot Git object reuse (development)

M3-07e-2 reduces repeated source downloads in hosted advisory runs. Each run
already shared a bounded verified blob cache across its PRs; each new workflow
still started cold. The trusted main checkout now supplies optional raw Git
objects to that same reader. Other clients keep their existing behavior.

This supports the exact-source inputs used for SECTION-12.3/12.5 findings and
SECTION-13.5 model/eval decisions. It does not change finding verification,
assertions, reviewer policy, or the authority required to read repository data.

## Authority and bounds

The workflow still checks out trusted main, never the candidate. Hosted prepare
explicitly constructs `trustedGitBlobSeed(process.cwd(), repository)` and injects
its reader into the existing activity factory. Every snapshot still fetches and
checks its exact commit and recursive tree from the authenticated GitHub client.
A seed for another repository is rejected. Authorization, current-PR checks,
source selection, frozen base assertions, and comparison identities are unchanged.

Only blob IDs and declared sizes from that fresh tree are read locally. Raw bytes
must match the Git blob hash, size, UTF-8 and binary-content rules before they can
enter the existing repository/object-ID cache. A missing object falls back to
GitHub REST. Malformed, corrupt or oversized objects fail closed without caching;
a Git `missing` response accompanied by stderr is a failure, not a cache miss.
The helper never checks out, executes, filters or builds candidate code.

Git runs without a shell, replacements, hooks, lazy fetch, protocols, inherited
Git environment overrides, or global/system configuration. Each subprocess has
a two-second SIGKILL timeout and 2 MiB + 256 bytes per-stream output limit. One subprocess
runs at a time, with at most 16 queued reads; excess concurrency fails boundedly.
The reader also bounds an optional asynchronous seed callback to 40 seconds,
covering the helper queue worst case of 34 seconds. A timeout fails without REST
fallback or late-result caching. Internal tests can lower `seedTimeoutMs` (1–40000);
this does not sandbox synchronous arbitrary code or cancel third-party work.
The existing 2 MiB blob, 32 MiB snapshot, 10,000-entry tree and 64 MiB/10,000-entry
LRU cache limits remain. This is process-local reuse, not persisted artifact reuse.

## Measurement and acceptance

Hosted prepare emits one redacted `hosted-snapshot-reads` counter record:
`commitAttempts`, `treeAttempts`, `remoteBlobAttempts`, verified `remoteHits`,
verified `localHits`, `localMisses`, `memoryHits`, `localReadFailures`,
`verificationFailures`, `requestFailures`, and `localCooldownBlocks`.
Attempts include calls blocked locally before HTTP dispatch. Only the known
`GitHubRateLimitWait` class is counted as a local cooldown; other SDK failures
are request failures, not asserted network counts. Counters contain no source
bytes, credentials, paths, request URLs, or raw SDK errors. They measure source
reads only, not App authentication, PR polling or Check publication calls.

Local exact Git trees from 2026-10-06 predict 883 unique cold blob reads for
PR54 (`ec08cbc` → `41df137`); trusted main `8004caf` contains 807 of those
objects, leaving 76 remote misses. PR52/53/54 together predict 922 unique cold
reads, versus 2,666 across three separate processes; the trusted checkout leaves
98 misses in the combined case. These are structural no-retry/no-eviction
estimates, not measured GitHub request totals or proof of delivery acceleration.
PR50 was excluded because its updated head was unavailable locally.

Actual local Git fixtures test cold/seed equality, fresh authorization denial,
commit/tree and repository mismatch, replacement objects, missing/promisor
objects without network, hash/size/UTF-8/binary/corrupt/oversized object rejection,
cache eviction, bounded queue and subprocess termination. Existing GitHub reader
and hosted-evidence tests retain their independent trust checks. Full hosted CI,
packaging and publication acceptance remain separate gates; M3 is not complete.

Quota failure 37400944397 remains valid historical evidence: one logged remote
403 exhausted the 5,000-request quota during snapshot blob loading; ten later
429 diagnostics were local cooldown rejections. Cross-process cooldown persistence
is a separate task and is not implemented here.

Local acceptance: ten focused primary/independent tests passed with zero skips;
352 tests and all ten fast checks passed (15.85 seconds), build and both immutable
API baselines passed, and all three model/provider/finding mutation verifiers
rejected their intended weakened guards. Real HTTP/PostgreSQL staging and the
Temporal parent lifecycle passed with the existing immutable runner fixture.
One earlier full fast attempt hit the existing provider retry-count test's
five-second deadline; the focused suite and a second unchanged full run passed.
This failed attempt is retained, not treated as a speed improvement. Compact
source hashes and attempt boundaries are in
`delivery/acceptance/m3-hosted-git-seed-local.json`.
