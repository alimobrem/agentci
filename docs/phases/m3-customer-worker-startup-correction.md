# Customer worker startup correction

This record preserves the read-only diagnosis and the subsequent owner-approved
two-setting harness correction. Local regression results are not customer scenario
acceptance. Failed run `38510993755`
attempt 1 remains retained at source `0c30b461`. Parent inspection verified the
three failure/cleanup artifact hashes, API and worker startup, worker exit 1,
API cleanup exit 0, zero operations/scenario progress, owned assertions/processes/
evaluator zero, database private-file removal and Temporal zero. No raw worker
stderr or error reason was retained. All four ordinary postmerge CI gates passed.

## Reproduced configuration defect

The anonymous package `agentci-0.4.0-m3-dev.3.tgz` was rechecked against SHA256
`ae9a50f2f64922feab6952dac157e5649fbc6c81f9246d84f178a75762763465` and inspected
as 543 regular safe archive members. Its installed worker calls
`controllerEvalPolicy()` immediately after base runtime configuration and before
constructing its PostgreSQL pool. That policy requires a valid immutable
`AGENTCI_EVAL_RUNNER_IMAGE`.

The actual harness session builder puts that image only in the evaluator's
environment. Its controller environment omits it, and the supervisor's controller
allowlist also drops an explicitly supplied pin. Executing the real session
constructor without initialization, then the exact package's policy function,
reproduced `EvalPlanConfigurationError: Invalid operator eval provenance or budget`.
Explicitly supplying the already verified runner pin makes policy validation pass.
No key was read, no API/worker was launched, and no GitHub/DB/Temporal connection
was requested; the temporary constructor resources were closed.

This proves a startup configuration defect consistent with the observed early
exit. It does not recover the missing original error or rule out later defects.
Evidence is in `delivery/acceptance/m3-customer-worker-policy-reproduction.json`
and `m3-customer-worker-session-env-reproduction.json`.

## Separate model-review Check opt-in omission

The harness also omits `AGENTCI_MODEL_REVIEW_CHECKS`, and its supervisor drops an
explicit supplied value. The exact packaged `initializeModelReviewCheckScheduler`
returns `null` for absent or `false`, rejects other values except exact `true`,
and enters outbox readiness only for `true`. A read-only stub stopped that path
before a real database connection; no GitHub request or Check write occurred.
Evidence is in `delivery/acceptance/m3-customer-worker-check-opt-in-reproduction.json`.

This does not explain worker exit 1: disabled Checks are deliberately nonfatal.
It is a separate later acceptance blocker because `observeCustomerReview` requires
the completed `agentci/model-review` Check with exact external ID, head and App
identity. Ordinary deterministic/eval Checks cannot substitute.

## Owner-approved bounded correction

1. Set the controller environment's runner pin from the existing verified
   `runnerImage` argument, never ambient environment or a mutable default. Extend
   filtering narrowly for the worker role; API/operator roles need no additional
   variable. Preserve evaluator credential separation and all other allowlists.
2. Set `AGENTCI_MODEL_REVIEW_CHECKS` explicitly to `true` only for this approved
   temporary demo and narrowly allow it for the worker. Preserve default-off
   behavior elsewhere, existing App/repository boundaries and GitHub permissions.
   Do not enable it through ambient inheritance or pass it to API/operator/evaluator.

The earlier proposal also discussed preflight diagnostics, fail-fast process
observation and an optional working-directory change. Those ideas are excluded
from this correction: the owner approved the two settings and installed-worker
regressions. Existing output draining, startup/readiness and cleanup behavior are
preserved.

Do not change the frozen dev.3 package/images, image validation, permissions,
credentials, provider selection, cost bounds, acceptance thresholds, cleanup,
fixture subjects or API/domain contracts. A corrected activation descriptor must
bind the reviewed new harness ancestor and keep the existing candidate hashes.
The activation descriptor binds reviewed main `0c30b461` as the harness ancestor;
its merge after CI and independent review triggers the same approved four-scenario
bundle. Candidate bytes and fixture subjects remain unchanged.

## Regression and acceptance plan

- Real session-constructor plus exact installed policy: missing pin fails; the
  verified immutable pin passes; a mutable/invalid pin fails. No secrets or
  infrastructure are needed for these checks.
- Actual supervisor child: the worker receives only the supplied public pin;
  API/operator do not gain it, and evaluator cannot inherit controller/App/provider
  credentials. Hostile ambient values cannot replace verified inputs.
- Check opt-in remains off when absent/false, rejects invalid text and enables
  only exact `true`. An installed-worker regression with owned local infrastructure
  and an explicitly synthetic GitHub transport must establish the exact App,
  repository/base/head/admission external ID and neutral/action-required Check
  expected by the real observation function. Block unexpected network calls;
  never weaken the observation or grant new GitHub permissions to make it pass.
  This regression remains fixture evidence, separate from the actual customer run.
- Run applicable local checks and exact-source hosted CI, obtain independent
  source/artifact review, then retry the approved temporary scenario bundle with
  all failure and cleanup records retained. Only its actual retained results can
  establish customer acceptance.

Parallel dashboard work remains isolated and local. All 18 M3 gates, complete
M0–M10 order, three adapters and the narrow inaccessible-provider exception are
unchanged. HTTPS/OIDC, final immutable release/download/demo and permanent evidence
retention remain separate obligations.

Owner approval is recorded by parent proposal
`Sentinel_789b44acc2608191b6334d019ce1b218` and user response
`Sentinel_61290a68c89c8191a2aaf86ab2a4cb86` (2026-10-14 13:49 UTC, “Yes.”).
It covers the two settings, installed-worker regressions, publication and merge
after CI and independent review, then the same four customer scenarios. It grants
no new permissions, credentials or release publication. The earlier failed run and
read-only reproductions remain retained.

The forward scanner classified two existing runtime-generated password expressions
in the newly changed session blob as password assignments. The failed local scan
is retained in `delivery/acceptance/m3-customer-worker-forward-initial.json`. A
variable-only rename (`password` to `pass`) preserves UUID generation, SQL role
privileges and URL assignment. Scanner rules, policy, ignores and allowlists are
unchanged. Failed local history is retained; the publication commit is assembled
directly on reviewed main and must pass its own scan and independent review.
