# M3-R6 hosted review selection

Pull-request events now select only the triggering PR. The workflow supplies a
strictly validated PR number, and the controller still fetches its current open
state and exact base/head identity before review. Event payload commit data does
not supply review identity. Missing or malformed PR numbers fail without falling
back to reviewing every open PR. The repository scope remains alimobrem/agentci.

Main-branch pushes, scheduled runs and manual dispatch retain full open-PR sweeps.
Discovery uses one page and at most one overflow probe, rejecting more than 100
open PRs or duplicate identities. This bounds discovery before evaluation; it does
not skip unchanged reviews in scheduled sweeps or share rate-limit state between
processes. Existing trusted-main checkout and evaluator acceptance remain intact.

| Operation | Requirement | Acceptance |
| --- | --- | --- |
| hostedReviewCandidates | SECTION-13.4 | Trigger selects one PR with zero list requests; invalid event/number/scope fails closed; sweeps preserve coverage and reject overflow/duplicates |

The real Octokit SDK tests in tests/hosted-selection.test.ts count discovery
requests using synthetic responses. These establish reduced discovery and candidate
selection, not measured end-to-end acceleration or complete resolution of API quota
exhaustion. Hosted workflow acceptance passed on main;
`delivery/acceptance/m3-r6.json` binds the trigger-39 run to its sole retained PR39 review.
