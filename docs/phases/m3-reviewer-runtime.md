# M3 reviewer controller runtime

Development integration; not an M3 release. The worker now registers admitted
review workflows when an operator sets `AGENTCI_REVIEWER_CONFIG_FILE`. Customer
REST/client/CLI submission is M3-07c and is not enabled by this configuration alone.
The existing signed GitHub webhook/eval path remains independently scheduled.

## Operator configuration

Start with `deploy/reviewers.synthetic.example.json`. It configures all seven
reviewer roles against a selected README file, using an explicit no-network
fixture provider. Its clean result demonstrates orchestration, not model quality
or whole-repository correctness. `proposed-defect` generates an advisory synthetic
proposal; it does not reproduce or confirm a defect. Choose a deployment-owned
budget UUID and selected files appropriate to the repository.

For a locally built development worker, retain the existing GitHub App and
PostgreSQL/Temporal setup, then from the repository root run:

```sh
export AGENTCI_REVIEWER_CONFIG_FILE="$PWD/deploy/reviewers.synthetic.example.json"
docker compose --env-file .env -f deploy/compose.yaml -f deploy/reviewer.compose.yaml up -d --build worker
```

The overlay mounts the operator configuration read-only and uses a development
image tag. Existing databases must have migrations through 012 applied in order;
the base Compose initialization mount only initializes a fresh database. Preserve
existing database volumes. Missing migrations fail startup rather than accepting
work with incomplete storage. The packaged source includes the migrations.

Live registrations use `kind` values `openai`, `anthropic`, or `xai`, with explicit
`models` entries using each existing adapter's model-profile contract. Operators
must supply current capability/context/output limits, upper input/output pricing
and a pricing revision. There are no implicit price/model defaults. Credentials
are read only from `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `XAI_API_KEY`; do not put
secret values into the JSON file, profiles, or repository. Endpoints are supplied
by the supported adapters, not by repository/model input. Live acceptance remains
explicitly deferred until credentials and provider acceptance are available.

Profiles pin the role configuration, response schema, selected evidence, execution
mode, shared budget identity and duration. The response schema must be the shipped
finding-proposals schema. A new review does not reset the budget. Changing its
limit requires a new budget UUID. `codingProvenance` contains operator-attested
head/provider/model/evidence-digest records; repository claims are not trusted
provenance. Independence-required profiles fail when trusted provenance is absent.

## Admission and recovery boundaries

The controller authorizes the exact organization, repository, PR, base and head
against the installed GitHub App's current PR view. It rechecks before each role.
Stale revisions are denied. GitHub blob contents are verified by identity and
bounded by the existing snapshot reader; unsupported snapshots fail explicitly.
Transport must authenticate every caller separately; this runtime is not a public
write credential.

Admission binds a digest of the operator runtime policy plus installation and
scope. Changing configuration or provenance can invalidate pending admissions;
execution fails closed instead of silently applying the new policy. Re-admit with
a new operation ID after checking the change. Credential rotation alone does not
change policy identity. Immutable old profile revisions remain available as
historical evidence, and revoked profiles cannot be reactivated by config reload.

The worker heartbeats IDs, preserves role results and charges across retries, and
saves summaries only after reconstructing their complete role/finding references.
Source, raw provider output and private errors stay outside workflow history.
Independent recovery verifies the exact Temporal run after termination. Uncertain
provider charges remain reserved/accounted; cancellation does not imply that a
remote provider rolled back a sent request. A summary committed before termination
remains completed review evidence even if Temporal records the workflow terminated.
