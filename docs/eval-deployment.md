# Deploy the M2 evaluator candidate

M2 is in development. These source-checkout instructions prepare a separate
self-hosted evaluator; published M2 image/download and live customer acceptance
remain release gates. Use the released M1 instructions until M2 is published.

The controller runs `deploy/compose.yaml`. The evaluator uses
`deploy/eval-worker.compose.yaml` on dedicated evaluation infrastructure with its
own Docker daemon. The controller/App key must never share that daemon. The
trusted evaluator controls the daemon; untrusted child containers receive no
socket, host mounts, database credentials or App credentials. Restrict database
and Temporal connectivity to trusted infrastructure; do not expose either to the
Internet. Configure private networking and transport protection for remote access.

An administrator applies `002_m2.sql` and `002_m2_eval_role.sql` after M1 schema
setup. Create a distinct login using an interactive administrator `psql` session:

```sql
CREATE ROLE agentci_evaluator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS IN ROLE agentci_eval_executor;
\password agentci_evaluator
```

The password prompt keeps the value out of shell arguments and SQL history.
Use this login only in the evaluator. The worker verifies effective privileges
before polling: it rejects the admin login, controller table reads, DDL, input
rewrites and observation overwrites. Each database is bound to one organization
and repository scope. Provision the same scope in both processes.

Copy `deploy/eval-worker.env.example` to a private directory outside Git and
make it mode 0600. Fill in a credential-free database URL, separate
`AGENTCI_EVAL_PGUSER`/`AGENTCI_EVAL_PGPASSWORD`, reachable Temporal address and
immutable evaluator service/default runner pins. Optional engine pins must match
the controller. Public HTTP provider IDs/revisions go in the controller;
endpoints and authentication go only in the evaluator's private provider JSON.
Create a regular mode-0600 JSON file containing `[]` when HTTP is unused. Make
that file readable by service UID 1001 without granting other users access.

Set the group ID of the dedicated daemon socket explicitly. Preload/pull the
exact runner images on that daemon. Development images can use their immutable
`sha256:` image IDs; published deployments use registry references with
`@sha256:` digests. The evaluator service itself must use a pinned image reference.

```sh
docker compose --env-file /absolute/private/evaluator.env \
  -f deploy/eval-worker.compose.yaml up -d
```

The service has a read-only filesystem, bounded temporary storage, no Linux
capabilities and no privilege escalation. Its environment is an explicit
allowlist. It does not load the controller `.env`, inherit the caller's App
variables or mount the App key. Treat rendered Compose output and container
inspection as sensitive: they contain the evaluator database password.

For the temporary local demo only, use the same local Docker daemon and join
its existing controller network. Set `AGENTCI_CONTROLLER_NETWORK` to that
Compose network name, evaluator database host to `postgres`, and evaluator
Temporal address to `temporal:7233`:

```sh
docker compose --env-file /absolute/private/evaluator.env \
  -f deploy/eval-worker.compose.yaml \
  -f deploy/local-eval-network.compose.yaml up -d
```

This shares infrastructure for development and does not demonstrate production
host isolation. It exposes no additional database or Temporal ports. Leave the
original controller environment and App key mounts on controller services only.

Validate configuration with disposable values without starting services:

```sh
node scripts/check-eval-deployment.mjs
```

If Compose is a standalone binary, set `AGENTCI_COMPOSE_BINARY` to its path.
The check renders both modes and asserts the environment boundary, private mount,
restricted login, read-only service and network selection. The separate packaged
worker runtime probe still verifies actual restricted SQL execution, isolated
children and restart; configuration validation does not replace it.
