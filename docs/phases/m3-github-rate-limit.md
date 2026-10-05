# M3-R5 GitHub rate-limit cooldown

Advisory run 37352430866 failed before staging PR36's comparison. Its allowlisted
GitHub diagnostics reported HTTP 403, primary-rate-limit, remaining 0, limit 5000,
and reset epoch 1791224134 (2026-10-05 18:15:34 UTC). Multiple activity retries
occurred before reset. This proves the cause of this run's failure; it does not
retroactively prove every earlier 403 had the same cause.

`guardGitHubRateLimits` is attached to each installation client. Confirmed primary
exhaustion uses the response reset time. An applicable retry-after also participates;
the later deadline wins. A 429 or confirmed exhaustion without valid timing uses
one minute. Bare 403/401/500 without rate-limit evidence retains existing handling.
Numeric fields use the bounded allowlist parser; invalid values cannot become an
unbounded timer. There is no timer or sleeping worker in the guard.

Until expiry, the client throws a redacted `GitHubRateLimitWait` before dispatch.
A locally rejected retry cannot extend its own cooldown. At expiry, requests can
proceed normally. The original upstream failure is retained and not relabeled a
successful review. The guard neither changes App access nor creates a new token
or account to evade limits.

Scope is one client instance. Requests already dispatched may finish, and a fresh
process must learn its own limit state. The hosted schedule/manual dispatcher must
also respect observed reset times. This guard reduces futile retry traffic; it
does not solve unnecessary whole-repository rereads across workflow runs. Reusing
unchanged completed reviews is a separate prospective improvement and must bind
trusted verifier, runner and exact subject identities before skipping work.

| Operation | Requirement | Acceptance |
| --- | --- | --- |
| guardGitHubRateLimits | SECTION-13.4 | Primary reset, retry-after maximum, expiry, malformed timing, ambiguous access denial and non-extending local retry |
| GitHubRateLimitWait | SECTION-13.4 | Redacted deadline/error with no request, credential or upstream body |

`tests/github-rate-limit.test.ts` drives the real SDK with deterministic time and
counts outbound fetches. No request is sent during cooldown and the first eligible
request succeeds after expiry. Hosted adoption and post-reset acceptance remain
pending. Timing follows [GitHub's documented limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
