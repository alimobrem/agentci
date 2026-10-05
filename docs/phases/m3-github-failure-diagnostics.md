# Hosted GitHub failure diagnostics

M3-R4 tracks the missing diagnostic evidence discovered in advisory runs
37343583080 and 37346708609. Both failed with HTTP 403 during Git blob reads and
subsequent identity lookups. These logs alone do not establish whether the cause
was a primary limit, secondary limit or access denial. No permission expansion,
secret rotation or successful hosted acceptance is claimed.

The App client now attaches an error observer. It emits a fixed JSON event with
status, category, numeric limit/remaining/reset/retry-after fields and a bounded
hexadecimal GitHub request ID. It does not serialize request URLs, authorization,
error messages, response bodies or arbitrary headers. Malformed values become
null. The hook rethrows the original SDK error even if logging fails, preserving
existing failure handling and leaving retry policy unchanged.

| Internal operation | Requirement | Acceptance |
| --- | --- | --- |
| githubFailureDiagnostic | SECTION-13.4 | Allowlisted fields, numeric bounds, ambiguous 403 classification, credential/body exclusion |
| observeGitHubFailures | SECTION-13.4 | Real SDK failure still rejects, diagnostic emitted, failing sink cannot replace failure |

Both operations are covered by `tests/github-failure-diagnostics.test.ts`.
Local fast checks passed. Hosted observation remains pending until this trusted
code is merged into main and a subsequent advisory run exercises it. PR-head code
must never be executed with the App key to obtain diagnostic evidence.

Classification follows [GitHub's rate-limit documentation](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api):
403/429 with zero remaining indicates primary exhaustion. A bare 403 remains
`forbidden-or-rate-limit`; it is not sufficient evidence to change permissions.
A 429 without primary-limit evidence is `rate-limit`. Use the retained reset and
retry-after fields when diagnosing pacing; this change does not add automatic
retries or claim the underlying failure is repaired.
