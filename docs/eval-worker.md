# Evaluation worker boundary (M2 development)

The eval worker executes staged unit IDs using immutable projected snapshots and
operator-pinned runner identities. It has no GitHub App key, webhook secret,
evidence bearer token or controller database login. Its configuration refuses
known controller/GitHub credential variables. It uses a separate Temporal queue,
`agentci-eval-v1`. The Temporal activity entry point is implemented and tested locally. The published
worker image and final-source full CI remain pending.

Apply `deploy/migrations/002_m2.sql` using the controller migration identity.
An administrator can then apply `deploy/migrations/002_m2_eval_role.sql`, provision
a separate database LOGIN through the deployment's secret manager and grant the
`agentci_eval_executor` group to it. Do not reuse the migration/admin login or
assume the group using an administrator connection. The worker checks effective
permissions and rejects superuser, object-creation privileges, controller table
access, input mutation and observation rewriting. It can read scoped eval inputs,
claim/renew/complete units and insert immutable normalized trial checkpoints.
Each database remains bound to one deployment scope.

Worker environment:

| Variable | Purpose |
| --- | --- |
| `AGENTCI_REPOSITORY` | Exact owner/repository scope |
| `AGENTCI_ORGANIZATION_ID` | Deployment organization UUID |
| `AGENTCI_EVAL_DATABASE_URL` | Separate restricted database login |
| `AGENTCI_EVAL_RUNNER_IMAGE` | Immutable default runner digest |
| `AGENTCI_EVAL_ENGINES_IMAGE` | Optional immutable Promptfoo/DeepEval runner digest |
| `TEMPORAL_ADDRESS` | Temporal service address |
| `TEMPORAL_NAMESPACE` | Namespace; defaults to `default` |
| `AGENTCI_EVAL_PROVIDERS_FILE` | Optional private operator JSON file; max 1 MiB, no group/other permissions |

Provider records follow [the HTTPS provider contract](http-eval-provider.md).
Manifests select an opaque provider ID; the operator alone configures verified
HTTPS, pinned network address and separately scoped authorization. Production
worker configuration rejects the plaintext loopback test option.

The unit driver renews its fenced lease, resumes stored trials, reaps prior-owner
containers under a database lock and refuses completion after lease loss or
cancellation. A real separate database login passes local execution while reads
of all controller tables, DDL and input mutation fail. Native Temporal retry, workflow cancellation cleanup, worker-shutdown retry and
history replay pass local integration tests. Published service packaging and full
final-source CI remain required before this is a supported customer deployment.

After a build, `npm run eval-worker` starts this separate service. Temporal history
carries unit IDs and bounded progress counters; snapshot files and provider
credentials remain outside it. Activities heartbeat, and workflow cancellation
uses `WAIT_CANCELLATION_COMPLETED` so continuation waits for cleanup. A worker
shutdown or timeout releases the SQL unit for retry; an explicit workflow cancel
marks it cancelled. Unknown units and mismatched operator configuration fail
without repeated attempts. See the [Temporal cancellation contract](https://docs.temporal.io/develop/typescript/workflows/cancellation).

Schema initialization serializes concurrent callers with a transaction-scoped
advisory lock and records a checksum-bound applied migration. Repeated setup
validates the actual SQL body and recorded checksum without replacing live eval
triggers; altered SQL or an applied-version mismatch requires an explicit new
migration. The regression test holds writer locks while repeat setup succeeds. Executor-role provisioning tolerates concurrent creation in another
database while verifying that the existing group has no elevated capabilities.
[Internal operations](../specs/api/eval-worker-operations.json) map the workflow
and activity to requirements and real test scenarios.

Cleanup-refusal fault injection leaves a real owned container, rejects successful
completion and retains no trial observation. A subsequent fenced owner removes
the orphan and executes a new trial. HTTP units do not invoke the Docker cleanup
backend; external retries use the [provider deduplication contract](http-eval-provider.md).

## UBI image checkpoint

The `eval-worker` Dockerfile target runs on UBI 10 with Node 26.10.0 and the
locked production dependencies. It copies Docker CLI 29.8.2 from the pinned
official multi-platform image, together with its upstream license. No Alpine
filesystem or Docker daemon is shipped. npm/npx and RPM installer tooling are
removed through the package resolver. The service runs as UID 1001; the real image
probe uses a read-only root filesystem and bounded `/tmp`.

Local development build and acceptance:

```sh
docker build --target eval-worker -t agentci-eval-worker:m2-local .
node scripts/eval-worker-image-smoke.mjs agentci-eval-worker:m2-local agentci-eval-runner:m2-local
```

Build the default runner first. The probe creates its own temporary network,
PostgreSQL and Temporal services, provisions a separately authenticated restricted
login, executes real isolated eval children, preserves assertion failure, checks
shutdown/restart and removes only its own resources. Mandatory CI now builds,
scans and probes this worker in addition to the controller services and runners.
Published native image/download acceptance remains open.

The worker is a trusted Docker-daemon client. Socket access grants daemon control;
deploy it on dedicated evaluation infrastructure separated from controller/App
services. The daemon socket group must be explicitly granted to the worker UID.
Child eval containers receive no socket, database credentials, App credentials or
host mounts, and have networking disabled. `DOCKER_CONFIG` points to a private
empty image directory so operator/host registry configuration is not inherited.

The local scan detects UBI packages, Node packages, the Temporal Cargo-lock
inventory and Docker's Go runtime with zero known findings. The official CLI
binary exposes no bundled Go-module inventory to this scanner; that coverage
limit remains part of release assessment. It does not close the optional engine's
separate unpatched HIGH finding. Component pins, license checksum and native
metadata are recorded in [the dependency record](../releases/m2-eval-worker-dependencies.json).

Native AMD64 CI run 37190707698 passed this packaged runtime probe and the
full source verification. [Its evidence](../releases/m2-eval-worker-ci.json)
records the exact candidate/CI tree, artifact ID and SHA256, worker image ID,
runtime assertions and each image scan. Publication remains a separate gate.

## Controller staging candidate

The separate controller activity `stageEvalReview` fetches both exact Git commits,
compiles the selected comparison plan, and stores projected snapshots before
returning only review, comparison and unit UUIDs. Existing suites use baseline
assertions, models and thresholds for both subjects; newly added suites execute
on head only. Zero selected suites still produce retained comparison evidence,
including uncovered requirements. An attempt UUID identifies one immutable plan;
retrying with changed inputs or runner provenance fails explicitly.

The operator supplies `AGENTCI_EVAL_RUNNER_IMAGE` and optional
`AGENTCI_EVAL_ENGINES_IMAGE` as immutable pins. Public HTTP identities use
`AGENTCI_EVAL_PROVIDER_IDENTITIES`, a JSON array of `{id,revision}` entries only.
Provider endpoints and authentication remain private evaluator configuration.
`AGENTCI_EVAL_MAX_UNITS` defaults to 128 (maximum 512), and
`AGENTCI_EVAL_MAX_TOTAL_TRIALS` defaults to 2000 (maximum 100000), summed across
every selected suite, model and subject. Exceeding a budget fails before staging.

This activity is not yet registered in the controller or connected to a parent
workflow. Local acceptance uses a real HTTP Git fixture and PostgreSQL; live App
dispatch, stale-PR publication protection and customer PR acceptance remain open.
