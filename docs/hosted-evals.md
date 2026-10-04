# Hosted AgentCI behavioral self-review

M2 hosted implementation is in progress under `M2-HOSTED-DOGFOOD`. The current
GitHub-hosted workflow still performs M1 semantic review. The self-eval foundation
below does not yet publish hosted behavioral Checks or complete this task.

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

## Remaining hosted integration

The controller must check out trusted main code, resolve exact Git objects as
data, stage immutable comparisons and run the normal Temporal parent with a
separate restricted evaluator. Only unit identifiers cross to evaluator workflows;
reviewed code runs in the child boundary described above.

Before terminal Checks publish, retain verified semantic evidence and complete
behavioral exports through the official artifact action. Hosted SQL is ephemeral,
so behavioral Check links must point to that authenticated repository artifact,
not a nonexistent service API. The publish operation must verify export identity,
producer source/version, digests, repository-scoped artifact URL and current PR
head, and reconcile only the exact App/name/attempt. Failed attempts must publish
unavailable outcomes from retained evidence without becoming neutral successes.

The scheduled/main/event workflow must reconcile missed and changed PR revisions
without the local tunnel. Actual hosted passing and deliberately failing revisions,
artifact download verification, retry/stale behavior and released-image packaging
are required before task or M2 phase completion.
