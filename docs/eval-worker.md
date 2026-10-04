# Evaluation worker boundary (M2 development)

The eval worker executes staged unit IDs using immutable projected snapshots and
operator-pinned runner identities. It has no GitHub App key, webhook secret,
evidence bearer token or controller database login. Its configuration refuses
known controller/GitHub credential variables. It uses a separate Temporal queue,
`agentci-eval-v1`. The Temporal activity entry point and published worker image are
still in progress; this document describes the implemented configuration/driver.

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
of all controller tables, DDL and input mutation fail. Native Temporal retry,
cancellation/history replay, published service packaging and full final-source
CI are required before this is a supported customer deployment.
