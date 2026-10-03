# M1 local deployment and GitHub App setup

M1 is in progress. This is a single-repository development deployment, not a
production SaaS deployment. No AgentCI images have been published to GHCR yet.
Local image names are `agentci-api:0.2.0-m1` and
`agentci-worker:0.2.0-m1`; intended registry names are
`ghcr.io/alimobrem/agentci-api` and `ghcr.io/alimobrem/agentci-worker`.
Both service images use Red Hat UBI 10 minimal with official Node.js 26.10.0, pinned by digest.
PostgreSQL 18.6 and the local Temporal development server use their upstream images.
PostgreSQL 18 mounts `/var/lib/postgresql`; its separate `postgres18-data` volume
leaves earlier PostgreSQL 17 volumes intact. Existing data requires a reviewed
`pg_upgrade` or dump/restore migration; switching image versions does not migrate it.

## Local preview without GitHub credentials

Requires Node.js 26.10.0 (26.x), npm, Git, Docker and its running daemon.

```sh
npm ci
npm run check
npm run build
node scripts/demo-m1.mjs
docker build --target api -t agentci-api:0.2.0-m1 .
docker build --target worker -t agentci-worker:0.2.0-m1 .
node scripts/image-smoke.mjs
```

The CLI demo creates two temporary Git commits: an added production-write
permission and a changed active safety requirement. The result is advisory high
risk, with the explicit permission verified and possible requirement weakening
labeled inferred. Malformed YAML exits 2 instead of producing a clean review.
Temporary files are removed afterward.

The image smoke test uses real PostgreSQL and Temporal with synthetic App
credentials. It checks non-root startup, readiness, rejected signatures, evidence
authentication, signed closed-PR delivery, and graceful shutdown. It creates and
removes its own Docker containers/network. It does not contact GitHub or publish
a real PR Check. Temporal retry/replay and PostgreSQL integration tests are
separate: see `tests/integration/m1.test.ts` and the verification workflow.

## Register and install the App

The owner-authorized private `AgentCI-alimobrem` App is now installed only on
`alimobrem/agentci`. Its first real Check and evidence are recorded in
[the dogfood record](dogfood/m1-first-check.md). This local instance uses a temporary
tunnel and is not a continuously available release deployment.

For a new registration, `npm run setup:github` implements GitHub's manifest flow.
Set `AGENTCI_SETUP_URL` to a reachable HTTPS origin forwarding to localhost:3000;
run the helper before the API binds that port. Open its one-session setup URL,
create the private App, select only `alimobrem/agentci`, and install. It verifies
scope through the App API, writes `.env` with mode 0600, and stores the PEM under
ignored `.agentci/local/` with private permissions. It refuses to overwrite `.env`.
Stop the helper before starting Compose. Keep the tunnel alive afterward.
The helper is specific to this repository and never prints credentials.


In GitHub Settings → Developer settings → GitHub Apps, create an App with a unique
name and homepage pointing to the AgentCI repository. Set its webhook URL to
`https://YOUR_REACHABLE_ORIGIN/v1/webhooks/github` and enable webhook delivery.
The public origin must forward only to the API; do not expose PostgreSQL or the
Temporal development service. Choose the endpoint/hosting provider before
enabling live delivery. Use HTTPS with a trusted certificate.

Set a randomly generated webhook secret. Request repository permissions:

- Metadata: read (GitHub's baseline).
- Contents: read, for immutable commit/tree/blob data.
- Pull requests: read, to resolve and recheck PR state.
- Checks: read/write, for advisory Check reconciliation and publication.

Subscribe to `Pull request`. Install the App using **Only select repositories →
alimobrem/agentci**. Do not request contents write, organization access, or repair
permissions. Download its private key outside tracked source, keep mode 0600, and
record the App ID and installation ID. Do not paste secrets or private keys into
chat, source, logs, or GitHub Actions output.

This candidate handles opened, synchronize, reopened, ready_for_review, edited and
closed PR events. Signed ping is ignored safely. Other scoped events are durably
recorded as ignored; push-triggered rescan and Check requested actions are not
implemented. A closed or changed-base/head PR is superseded before publication.
Checks are always bound to the reviewed head SHA. A head change during the final
GitHub API call can leave a Check on the old commit, never on the new commit.

## Start the configured local stack

Requires Docker Compose (`docker compose version`). The local verification
scripts also work without Compose; this host initially lacked the Compose plugin.
The Compose configuration was validated using a checksum-verified temporary
official Compose binary and placeholder values; configured live App startup is
still pending.

```sh
cp .env.example .env
```

Fill `.env` with the App/installation IDs, private-key absolute path, distinct
random webhook/evidence secrets of at least 32 characters, and a URL-safe database
password. Set `AGENTCI_PUBLIC_URL` to the reachable HTTPS origin. Keep the
organization UUID stable. This database is bound to one organization/repository;
reuse with a different scope fails rather than exposing its evidence.

To let the non-root containers read your mode-0600 key, use your host UID/GID:

```sh
export AGENTCI_UID=$(id -u)
export AGENTCI_GID=$(id -g)
docker compose --env-file .env -f deploy/compose.yaml up --build -d
curl -fsS http://127.0.0.1:3000/readyz
docker compose --env-file .env -f deploy/compose.yaml logs --tail=30 api worker
```

Place the private key on a host path shared with your Docker VM. Docker bind
mounts from an unshared `/tmp` path can become a directory instead of the file.
The container build excludes secrets. The API's host port and Temporal UI are
bound to loopback. Only the worker mounts the App private key; the webhook API
does not need signing-key access. Temporal's persisted local development server
is not suitable
for public or production use.

The SQL initialization migration runs when the PostgreSQL volume is first created.
For an existing database, back it up and apply `deploy/migrations/001_m1.sql` using
an authorized database connection before starting this version. Future schema
changes require ordered migrations and explicit upgrade/rollback instructions.
Stop without deleting data:

```sh
docker compose --env-file .env -f deploy/compose.yaml down
```

Do not add `--volumes` unless intentionally discarding local data. Back up both
database and Temporal state before upgrades. This candidate has no implemented
database retention/backup automation or production Temporal configuration.

## Observe a real PR review

Open or update an AgentCI PR after installing the App and enabling live delivery.
Webhook 202 means durably received, not successfully reviewed. The PostgreSQL
outbox dispatches a Temporal workflow; activities read the exact base/head commits,
perform data-only analysis, store immutable evidence, recheck PR identity, and
publish `agentci/review` as an advisory neutral Check. Exhausted failures produce
an action-required infrastructure/input failure when GitHub remains reachable;
they never claim a clean review. The Temporal workflow remains failed.

The Check contains a detailed evidence API URL. Read it using the configured
bearer token through an authenticated client (there is no browser login UI yet).
The response includes the analysis and a SHA-256 digest over canonical JSON with
recursively sorted object keys. Repository content is not embedded in findings;
structured changes contain JSON pointers and content digests.

Track failed workflows in the loopback Temporal UI at `http://localhost:8233` and
inspect container logs. Restore dependencies/permissions before using GitHub's
webhook redelivery or a new PR synchronization event. A received delivery ID is
deduplicated; conflicting reuse returns 409. Failed workflows may restart on
redelivery while their outbox entry is still pending. Already-dispatched failed
workflows need an operator retry in Temporal or a new GitHub delivery ID; accepting
the same delivery again does not automatically rerun a dispatched workflow.

## GitHub-hosted repository dogfood

The `AgentCI advisory review` workflow runs trusted `main` code on GitHub-hosted
runners for PR events and main-branch updates. A 30-minute recovery schedule and
manual dispatch reconcile every open PR, including changes to its base. Scheduled
runs can be delayed by GitHub; this is advisory CI coverage, not an uptime SLA.
The workflow never checks out or executes the PR head with credentials. It reads
immutable Git objects through the repository-only App instead.

The repository secret `AGENTCI_APP_PRIVATE_KEY` holds the encrypted App key.
Only trusted main-branch workflows may use it. Changes to trusted workflows or
dependencies deserve careful review; this key grants the App's declared access.
GitHub's workflow token has Contents read only. Checks write comes from the App.

Each run uses isolated PostgreSQL and Temporal. Evidence and workflow history are
uploaded as immutable Actions artifacts before a neutral Check is published.
The Check links directly to the artifact; download requires GitHub authentication.
Records contain exact PR/base/head identities, analysis digests and the producer
version/source. Artifact retention is 90 days; download important records before
expiry. Local webhook deployments keep their separate persistent PostgreSQL
records and bearer-authenticated evidence API.

A failed run is visible in Actions; workflow activity failures attempt an
`action_required` Check. No neutral Check is published when evidence upload fails.
Rerun after restoring credentials or dependencies, or dispatch the workflow to
reconcile current open PRs. The next event/recovery run also retries missed work.
Closed or superseded PR heads are skipped after a final identity check.

## Explicit inputs and limits

Repository selectors come from both reviewed versions of `agentci.yaml`.
`spec.extensions.agentci.io/review` is a namespace key, written in YAML as:

```yaml
extensions:
  agentci.io/review:
    tools: [tools/**]
    permissions: [permissions/**]
    modelConfigs: [models/**]
```

Configured permission files may declare this explicit v1 format:

```yaml
apiVersion: agentci.io/v1alpha1
kind: PermissionManifest
permissions:
  - id: production-deploy
    environment: production
    actions: [write]
    resources: [cluster]
```

Actions are read/write/delete/execute; environments are production/non-production.
This candidate confirms added production mutations and explicit secret reads.
Other configured policy/permission changes get a high-risk inferred finding;
arbitrary policy languages and source-code permissions are not semantically proven.
Models outside configured selectors are not inferred by a model reviewer.

Bounds: 10,000 tree entries, 2 MiB per blob, 32 MiB per snapshot, 5,000 structured
field changes per file, and 1 MiB webhook bodies. Truncated trees, binary files,
symlinks/submodules, missing specifications and malformed selected contracts fail explicitly. No repository
scripts, hooks, workflows, dependency installation or eval commands are executed
by review activities. Behavioral evals remain M2 work.

## Release and completion remain pending

The checked-in workflows prepare CI, scans, package verification and GHCR
publication. Publication is a manual candidate workflow after verification.
Published digests still require downloaded-image smoke tests and release evidence;
workflow success is not automatically milestone completion. Changing workflow
files requires the token's repository-scoped Workflows permission. Package
visibility must be verified public separately from repository visibility.

M1 still needs live App/PR verification, successful CI on the release SHA,
scan disposition, published/downloaded images, an immutable release and its user
demo. M2 remains not-started until all M1 gates pass.

Integration references: [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app),
[GitHub CI Checks](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-ci-checks-with-a-github-app),
[Temporal workflows](https://docs.temporal.io/workflow-definition).
