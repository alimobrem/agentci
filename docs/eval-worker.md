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
