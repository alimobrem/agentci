# Customer onboarding — M1 extension candidate

State: in-progress, version `0.2.1-m1`. Not yet a published/customer-validated release.
The immutable `0.2.0-m1` package does not contain the new init/setup/client commands.
M2 remains not-started while the expanded customer acceptance gates are pending.

## What a customer runs

AgentCI is an agent-first CI/CD control plane. M1 provides its first capability:
semantic PR review and machine-readable evidence. The normal review surface is
GitHub Checks; agents consume the authenticated evidence API. The CLI bootstraps
projects and can perform local immutable-commit diffs. There is no dashboard,
public shared App, hosted signup or general review-job submission API yet.

This candidate supports one repository per deployment. Customer-owned private
Apps and secrets stay separate from the AgentCI project's dogfood App. The
existing App remains installed only on alimobrem/agentci.

## Install and bootstrap

Requires Node 26.10.0 (26.x), npm 12.2.0, Git, Docker/Compose and a reachable HTTPS
endpoint forwarding to the API. Current candidate installation from source:

```sh
git clone --branch codex/m1-customer-onboarding https://github.com/alimobrem/agentci.git agentci-service
cd agentci-service
npm ci
npm run build
npm pack --pack-destination /tmp
mkdir -p /tmp/agentci-customer-tools
npm install --prefix /tmp/agentci-customer-tools --omit=dev /tmp/agentci-0.2.1-m1.tgz
/tmp/agentci-customer-tools/node_modules/.bin/agentci init --root /tmp/my-agent-project
/tmp/agentci-customer-tools/node_modules/.bin/agentci validate --root /tmp/my-agent-project --json
```

Initialization requires an empty directory; it refuses to overwrite files. It
creates explicit requirements, review selectors and credential ignore rules.
Customize those requirements and add actual agent source/prompts/tool manifests.
Create your own Git repository from that project and push it to GitHub. Record the
repository's exact `OWNER/REPOSITORY` spelling. Hosting and GitHub account setup
are operator prerequisites, not automatically provisioned infrastructure.

## Register a customer-owned App

In a private deployment directory, use the installed CLI with explicit inputs:

```sh
export AGENTCI_SETUP_REPOSITORY=YOUR_OWNER/YOUR_REPOSITORY
export AGENTCI_SETUP_URL=https://YOUR_REACHABLE_ORIGIN
export AGENTCI_SETUP_APP_NAME=YOUR_UNIQUE_AGENTCI_APP_NAME
export AGENTCI_SETUP_ACCOUNT_TYPE=user # organization for an organization-owned App
export AGENTCI_SETUP_PORT=3000
export AGENTCI_SETUP_TEMPORAL_UI_PORT=8233 # choose unused ports for a second deployment
/tmp/agentci-customer-tools/node_modules/.bin/agentci setup
```

Forward the HTTPS origin to this localhost port. Open the one-session setup URL
printed by the helper. Review and create the private App, then install it with
**Only select repositories → your single configured repository**. It requests
Contents/Pull requests/Metadata read and Checks write. The helper refuses wrong
owners, missing/elevated permissions, all-repository access or additional repos.
It supports personal and organization registration paths using GitHub's
[manifest flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest).

Credentials are written to a mode-0600 `.env` and private `.agentci/local/` files.
An existing `.env` is never overwritten. Keep the deployment directory outside your
customer source repository, or ensure these paths are ignored. Stop setup before
starting the API on the same port. Never include the setup URL's session token in
public logs. App creation/installation is an explicit operator access grant.

## Deploy and review

Use the service checkout's `deploy/compose.yaml` and point `AGENTCI_ENV_FILE` to
your deployment `.env`; pass that file through Compose's `--env-file` as well.
Before publication, build the candidate images from this checkout. After a new
release is verified, use its published immutable digests; do not use the old M1
images to claim verification of changed candidate behavior.

```sh
# In agentci-service; supply absolute paths to your generated deployment .env.
export AGENTCI_ENV_FILE=/absolute/deployment/.env
export AGENTCI_UID=$(id -u)
export AGENTCI_GID=$(id -g)
docker compose -p agentci-customer --env-file "$AGENTCI_ENV_FILE" -f deploy/compose.yaml up --build -d
curl -fsS http://127.0.0.1:3000/readyz
```

Use a unique Compose project name for each deployment so volumes cannot collide.
For a second stack on the same host, choose unused API/Temporal UI ports at setup;
use that API port in readiness/client URLs. The generated `.env` retains both ports.

The `.env` binds App/installation/repository, organization UUID, webhook secret,
evidence bearer token and a database password. Compose supplies database and
Temporal addresses. Expose only the webhook API through trusted HTTPS. Keep the
key host path shared with Docker and readable by the chosen UID. UBI 10 amd64
requires x86-64-v3. The included persistent Temporal development server supports
the local onboarding preview, not production service operation. Production
Temporal hosting, retention/backup automation and uptime are outside this claim.

Open a PR adding an explicit production-write permission under the configured
selector. Observe `agentci/review`, exact head identity, a verified high-risk
finding and an evidence link. An unsupported permission action must produce an
input failure, then recover when corrected. The check is advisory, never proof
of behavioral correctness or a deployment approval. See
[local operations/recovery](m1-setup.md) for restart and redelivery behavior.

## Agent/API consumption

Supported control operations: GET `/healthz`, GET `/readyz`, signed POST
`/v1/webhooks/github`, bearer-authenticated GET `/v1/evidence/{id}`. Webhooks are a
GitHub integration boundary; agents do not need the webhook signing secret.
There is no general agent job-submission endpoint in M1.

Installed Node agents can use the public package entry point:

```js
import { AgentCIClient } from 'agentci/client';
const client = new AgentCIClient({
  url: process.env.AGENTCI_API_URL,
  token: process.env.AGENTCI_EVIDENCE_TOKEN,
});
await client.ready();
const record = await client.evidence(process.env.AGENTCI_EVIDENCE_ID, {
  repository: process.env.AGENTCI_REPOSITORY,
  pullRequest: Number(process.env.AGENTCI_PULL_REQUEST),
  baseSha: process.env.AGENTCI_BASE_SHA,
  headSha: process.env.AGENTCI_HEAD_SHA,
});
console.log({ risk: record.analysis.risk, findings: record.analysis.findings });
```

Supply exact expected commit IDs and PR number from trusted GitHub state. The
client validates schemas, identity and canonical analysis digest. It uses HTTPS
(except localhost), refuses redirects, sets a timeout and limits response size
to 4 MiB. A digest verifies the response's internal integrity, not who approved a
change. Review credentials grant read access to the deployment's evidence; keep
that token private and give agents only the access they need.

Typed `AgentCIError` codes include unauthorized, not-found, service-unavailable,
identity-mismatch, digest-mismatch and transport-failure. Error messages do not
include the bearer token or provider response bodies.

The executable source example is `node scripts/agent-api-demo.mjs` after building.
Set the variables shown above through a private environment; it also confirms
that an invalid token returns 401. The API contract is
[OpenAPI](../specs/api/openapi.json). This example consumes evidence from an actual
API; CI HTTP fixtures alone do not satisfy the live customer acceptance gate.

## Acceptance evidence

The new release ledger requires customer-onboarding and agent-api gates as well
as the original 16 checks. Record source/package/image identity, the fresh GitHub
repository and separate App scope, real PR success/failure/recovery and agent
observations. Customer acceptance remains pending until that live journey and
published-artifact verification pass. No customer production readiness is claimed.
