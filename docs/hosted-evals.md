# Hosted AgentCI behavioral self-review

M2 hosted implementation is in progress under `M2-HOSTED-DOGFOOD`. The candidate
workflow now prepares semantic and behavioral reviews through a separate evaluator,
retains complete exports, and verifies them before publication. GitHub main still
runs the released M1 workflow until this candidate is merged; candidate code and
local acceptance do not establish laptop-independent hosted operation.

## Isolated self-eval foundation

`evals/agentci-self.yaml` defines six structured behavioral scenarios: manifest,
adapter normalization, statistics, request identity, comparison and export/client
contracts. Each scenario runs existing named Node assertions. The frozen harness
requires their names, minimum test count and complete passing/failing accounting;
empty output, skipped/cancelled/todo tests or an early subject exit remain errors.
It emits the same native report consumed by AgentCI's ordinary trial pipeline.

The `eval-agentci` UBI image adds dependencies from the trusted AgentCI lockfile
to the existing non-root runner. Reviewed source stays in the temporary workspace.
Root-level read-only module resolution supplies `tsx` and production dependencies;
reviewed manifests never trigger npm installation. The unused native TypeScript
typechecker stays in build/CI, where the full typecheck remains required. The runner retains no npm/pip
installer, App key, controller environment, SQL credentials or daemon socket.
Execution uses the existing no-network/read-only/capability/resource boundaries.
The dependency image is an explicit operator pin: a PR requiring new dependencies
needs a separately reviewed image update; missing dependencies are errors.

Baseline runner/test/fixture files are declared as assertion inputs. Existing
comparisons overlay them on both exact source commits. A head replacing its
request-ID test and runner with `process.exit(0)` cannot erase the baseline's
identity regression. New suites before their first baseline adoption remain
explicitly head-only additions; they do not invent paired baseline evidence.

Native CI builds and scans the self-eval image and requires its immutable ID.
A fifteenth integration group runs actual AgentCI source, an identity regression
with weakened head assertions and a missing-execution case. The default runner
and optional Promptfoo/DeepEval images retain their existing independent tests.

## Candidate hosted operation

The workflow checks out trusted main, builds the trusted-dependency self-runner
and a separate UBI evaluator, and records immutable image IDs. The App controller
resolves exact Git objects as data and stages the existing Temporal parent. A
new randomly provisioned restricted SQL login supplies only evaluator grants.
The evaluator gets an explicit environment allowlist and daemon socket, read-only
filesystem and capability restrictions; it has no App key mount or controller
credentials. Reviewed child code retains the stronger no-network/no-socket boundary.
Only unit identifiers cross into evaluator workflow arguments.

Preparation defers all remote Check writes. Completed semantic records, parent
histories and complete hash-chained comparison exports are retained through the
official artifact action. Publication verifies the entire retained batch before
writing any Check: producer source/version/run/attempt, configured images, scoped
job and review identities, file sizes/digests, every frame/semantic result and
runner provenance. The artifact URL must identify this repository and run.
Current base/head and exact App/name/attempt reconciliation still apply.

Hosted SQL is ephemeral. Check details therefore link to the retained GitHub
artifact and identify `comparison-UUID.ndjson`, rather than suggesting a live
service API. GitHub access and artifact retention apply; deployment bearer tokens
are not needed for this path. Deployed customer comparison/export API links remain
unchanged. A failed prepare may still publish an action_required unavailable
result after successful retention; it cannot become a passing behavioral result.
A failed upload or invalid retained batch prevents publication.

Each scheduled/main/event run reconciles all currently open PRs with fresh attempt
UUIDs, repairing missed events and obsolete revisions without the local tunnel.
The controller, evaluator and private evaluator environment file are cleaned up.
This is a single ephemeral hosted runner, not a multi-tenant production daemon:
the trusted evaluator's daemon access remains a privileged infrastructure boundary.
The current hosted self-eval configuration supplies native trusted dependencies;
HTTP/optional-engine customer deployments have their separately tested operator
configuration and are not implicitly enabled here.

## Acceptance status and remaining release work

The local real-repository prepare probe completed PR5 and PR4 without remote Check
writes. PR5's six self-eval scenarios passed, but its comparison remains insufficient
because twelve impacted requirements have no suite coverage and the suite is a new
head-only addition before baseline adoption. PR4 has explicit missing policy and
adversarial suite gaps. These outcomes are retained; neither is called full coverage.

Native acceptance also runs the real hosted parent on separate evaluator queues,
preserves baseline/head regression and replay, refuses publication during prepare
and sanitizes private SDK failures. Retained-artifact HTTP/SQL publication acceptance
covers completed/unavailable outcomes, wrong repository/attempt rejection and stale
races. The original fifteen-group foundation has exact-source verified CI
37210326532; final-source connected pipeline CI remains pending.

After candidate verification and main adoption, actual hosted passing and deliberately
failing revisions, artifact download verification and unavailable/retry/stale behavior
must pass. Published-image/package verification, released customer replay and all M2
release/demo/retrospective gates remain open. Local prepare evidence is not a claim
that these release gates or M2-HOSTED-DOGFOOD are complete.
