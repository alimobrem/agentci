# Packaged customer acceptance preparation

M3-07d-2 remains unaccepted: its aggregate transport/Checks dependencies and
actual customer gates are pending. Child M3-07d-2a prepares an installed-package
runner and the [four original scenarios](../../specs/fixtures/m3-customer-acceptance.json).
It reuses existing fixtures and adds no provider, routing policy or approval threshold.

Run from the exact service source with Node26.10/npm12.2, installed development
test dependencies and existing isolated loopback PostgreSQL/Temporal:

```sh
node scripts/m3-customer-local-preparation.mjs /path/to/agentci-0.4.0-m3-dev.1.tgz --offline
```

Set `AGENTCI_TEST_DATABASE_URL` and `AGENTCI_TEST_TEMPORAL_ADDRESS` privately.
Both endpoints must be loopback; remote hosts and database query overrides are
rejected before package installation. Child processes receive only the test
database/Temporal settings, PATH and task npm cache, excluding App/API/provider
credentials. The runner installs only production dependencies into a temporary directory and
executes actual public client/CLI, compiled control/scheduler links, authorization,
identity, replay, cancellation and recovery tests. An isolated HTTP GitHub fixture
receives Check requests. There is no live mode; `--live` is rejected. Its final
JSON explicitly leaves actual GitHub, physical reproduction and upstream providers
unverified. It does not replace exact-source hosted CI or actual customer acceptance.

## Final external acceptance

Use `alimobrem/agentci-onboarding-demo` and its existing separate customer App;
keep the dogfood App limited to `alimobrem/agentci`. Metadata-only environment
inspection currently finds no configured App IDs/key-file path, deployment tokens
or provider keys in this executor. This does not establish that Apps or credentials
are unavailable elsewhere, nor does the Work GitHub connection prove deployment
App readiness. Do not search secret contents or print credentials.

Bounded customer fixture branches/commits/PR updates through Work GitHub and
scoped Check writes are now explicitly authorized. Separate customer credential
setup has now been separately approved by the owner; carry that approval forward.
Obtain exact installation/repository identity and
owner-entered private configuration through the secure mechanism below. The
manifest lists required immutable artifact, authority, subject and observation
data. Temporary demo execution does not add persistent access, paid services or
a Mac dependency; externally reachable endpoint acceptance remains separate.

Demonstrate seeded defect, unsupported claim, fixed-head result and failure/restart
on downloaded exact-source artifacts. Reproduction confirmation/fixed results
require actual isolated execution and retained trusted evidence; operator
attestations and local fixture success cannot substitute. Verify end frame plus
EOF/client completion for exports and anonymous download provenance. Preserve
all three adapters and the narrow upstream-provider exception. M3-07/R1, UI and
milestone release/demo acceptance remain separate and pending.

## Separate customer App preflight (M3-07d-2c)

The owner has approved bounded demo fixture publication through Work GitHub and
scoped customer Check writes and has now separately approved entry of the existing
customer App credential. The new `Customer acceptance preflight` workflow
(`.github/workflows/customer-acceptance-preflight.yaml`) is manual and restricted
to trusted `alimobrem/agentci` main. It prepares dependencies and builds the exact
service commit before loading the separate customer key. This first unit performs
only read-only App/installation/fixture validation; it does not run the four live
scenarios, create fixture PRs or write Checks.

With the existing secure setup approval, the owner opens **alimobrem/agentci → Settings →
Secrets and variables → Actions → New repository secret**, names it
`AGENTCI_CUSTOMER_APP_PRIVATE_KEY`, and enters the existing separate customer App
PEM privately. Do not paste the PEM into chat, issues or workflow inputs. No new
GitHub environment or PAT is needed. The owner supplies the public numeric App
ID and installation ID separately. The actual App and installation must grant
Contents, Pull requests and Metadata **read**, Checks **write**, and no additional
permissions, and select only `alimobrem/agentci-onboarding-demo`. Do not reuse the
original dogfood App or its secret. IDs are currently unknown; they are not
inferred from the existing Work GitHub connection.

The workflow's `fixtures` input has this public shape (placeholders must be
replaced with actual connector-verified public PR and full commit identities):

```json
{
  "repository": "alimobrem/agentci-onboarding-demo",
  "serviceSource": "<full current trusted-main workflow commit>",
  "appId": 0,
  "installationId": 0,
  "subjects": [
    {"kind":"seeded","pullRequest":0,"baseSha":"<full base>","headSha":"<full seeded head>"},
    {"kind":"fixed","pullRequest":0,"baseSha":"<full base>","headSha":"<full fixed head>"}
  ]
}
```

Zero IDs, placeholders, fork heads, changed heads, broad repository selection,
wrong App identity and excess permissions fail closed. Fixture branches/commits
and PRs are created through the separately authorized Work GitHub connector;
this App's permissions cannot perform those mutations. The key is written with
mode 0600 beneath a private 0700 runner-temp directory outside checkout, build
inputs and artifact directories. The controller removes that directory on
success or ordinary failure. It consumes no PR source on the credential-bearing
host and prints bounded errors rather than SDK exceptions. Uploaded output holds
public identities only. Abrupt process-death credential cleanup is not established
by these local tests and requires the live driver’s owned-process recovery tests.

This preflight is not physical reproduction, provider acceptance or customer
release evidence. The four original scenarios, process-death recovery, evaluator
isolation, complete exports, actual Check observations and endpoint acceptance
remain pending. A temporary runner-local URL does not establish the externally
reachable customer endpoint gate. All 18 M3 gates and M0–M10 phase order remain
unchanged; all three adapters remain required, observed-rate calibration remains
chosen and Wilson intervals remain descriptive. The sole authorized external
provider exception is unchanged.
