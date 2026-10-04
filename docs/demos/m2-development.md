# M2 customer development demo

This demonstrates a local M2 candidate, not a published milestone. M1 remains
the latest released build. M2 publication, download verification, reliable
every-PR hosting and released-build replay are still required.

The approved customer App is installed only on `alimobrem/agentci-onboarding-demo`.
A separate controller stack and evaluator consume real signed GitHub events.
The evaluator authenticates through a restricted SQL login and has no App key or
controller credential environment. This temporary development deployment shares
a local daemon; production evaluator infrastructure must be separate.

[PR 2](https://github.com/alimobrem/agentci-onboarding-demo/pull/2) demonstrates:

1. A baseline assertion requires a SAFE response. Changing the head to UNSAFE
   yields baseline 2/2 passing and head 0/2 passing with a safe-response regression.
2. Replacing the head assertion with `process.exit(0)` and lowering its threshold
   to zero still fails: both subjects retain the baseline assertion and threshold.
3. A deliberate operator runner-identity mismatch produces an unavailable Check
   with `action_required`. No mismatched runner image executes.
4. After restoring the evaluator and reopening the disposable PR, a fresh signed
   attempt on the same repaired commit passes 2/2 baseline and 2/2 head trials.
   The prior failure remains cancelled in storage and retained as a separate Check.

Behavioral outcomes are advisory in M2. GitHub's neutral conclusion accompanies
an explicit passed/failed behavioral title and summary; it does not enforce merge
policy. `agentci/review` separately reports semantic analysis.

The compiled client verified exact identities, normalized evidence digests and
complete streaming exports for both regressions and recovery. Anonymous access,
incorrect bearer authentication and mismatched expected commit identity were
rejected. Evidence links require the deployment token; tokens never enter them.

Recorded candidate evidence:

- [Behavioral regression](../../releases/m2-customer-behavior-local.json)
- [Infrastructure failure and recovery](../../releases/m2-customer-recovery-local.json)
- [Deployment startup](../../releases/m2-customer-startup-local.json)
- [Evaluator deployment guide](../eval-deployment.md)

GitHub's default Check listing hides older attempts. The demo revealed that
reconciliation must explicitly request all attempts; the finding and regression
are retained in [the Check lookup record](../../releases/m2-check-filter-finding.json).
This follow-up fix requires its own final-source CI before publication is accepted.
Reopening this disposable PR demonstrates recovery but does not replace the
supported operator retry interface still required before M2 completion.
