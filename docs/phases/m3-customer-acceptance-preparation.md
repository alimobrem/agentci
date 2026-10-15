# Packaged customer acceptance preparation

The temporary dev.4 customer scenarios and owned recovery/cleanup are now independently accepted in [the source-bound acceptance record](m3-customer-dev4-acceptance.md). Live externally reachable endpoint, HTTPS/OIDC dashboard and aggregate M3 gates remain pending. Historical preparation and failed attempts below are retained with their original qualifications.

The following local dev.3 preparation commands document the earlier fixture runner; they are not current dev.4 execution or release acceptance. Actual accepted dev.4 source, candidate hashes and run identities are in the linked record.

Run from the exact service source with Node26.10/npm12.2, installed development
test dependencies and existing isolated loopback PostgreSQL/Temporal:

```sh
node scripts/m3-customer-local-preparation.mjs /path/to/agentci-0.4.0-m3-dev.3.tgz --offline
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
App readiness. The later scope-only run recorded below has now independently
validated the saved separate key/App/install scope. Do not search secret contents
or print credentials.

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
original dogfood App or its secret. Public App `5182307` and installation
`167710386` were supplied separately and accepted by the scope-only guard; they
are not inferred from the Work GitHub connection.

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

## Current temporary demo driver preparation

The owner has separately approved entering the customer App key into the named
repository Actions secret. The owner saved it privately; scope-only run
`38490343015` has now passed independent artifact review for App `5182307` /
installation `167710386` and the exact selected repository/minimal permissions.
The App slug and actual fixture/scenario execution are separately unverified.

`Customer installation scope` (`customer-installation-scope.yaml`) performs only
App/install/repository reads without requiring existing fixture PRs. Run that
scope guard and anonymous candidate verification first. Then publish the trusted
fixture bytes from `customerFixtureFiles()` in
`scripts/lib/customer-approved-catalog.mjs` through Work GitHub. The base has the
safe-only source and trusted report harness; seeded/fixed heads replace their
harness with a trivial exit to demonstrate that the controller preserves the
trusted base assertion. The full demo additionally validates the actual
connector-created open PR repository/base/head before temporary service work.
The optional trusted recovery flag delays each fixture assertion so a retained
first trial and active second runner can be observed before SIGKILL; this is a
bounded synthetic fault fixture, not a new product acceptance threshold.

`Temporary customer demo` (`customer-live-demo.yaml`) checks out/builds trusted
main and consumes one public JSON input with `fixtures` as above, `releaseSource`
(full candidate commit), and the four exact checksums `packageManifestSha256`,
`packageSha256`, `imagesManifestSha256`, `publicationEvidenceSha256`. All refer to
the owner-approved corrected `v0.4.0-m3-dev.3`; the failed dev.2 identity remains untouched. The factored anonymous package helper verifies source/version,
file bytes, regular archive paths, equivalent packaged locks, actual locked-root
and consumer production installs, CLI/client and all three adapter imports before
any customer key file/private configuration exists. It reconstructs the canonical
four-asset checksum file from these hash-pinned public bytes and crosses the same
archive and six-role native evidence/cohort validator used for publication. It
uses immutable evaluator/runner refs.

The driver starts actual installed API/worker entrypoints against disposable
loopback PostgreSQL/Temporal. It retains a real synthetic finding, compiles a
controller-owned exact-subject assertion, drains API and worker, explicitly
applies authority through the packaged operator command, and starts both with
matching catalog/config identities. Unsupported proposals receive no approval.
Seeded and new fixed-head observations require actual evaluator receipts checked
against retained EvalStore units and complete authenticated history/export.
Never-staged cancellation must have no execution receipt. Recovery requires a
retained checkpoint plus an actually running owned assertion container before
evaluator SIGKILL, followed by the same parent/unit runs and retained trial
digests. Staged cancellation requires real retained execution and exact owned
cleanup. The original confirmed receipt remains immutable.

The evaluator is a separate published nonroot/read-only/capability-free container
with only its engine socket mount and restricted database credentials, and no
controller key/config mounts or App/provider credentials. The trusted runner
creates separate no-network/nonroot/resource-bounded assertion containers.
Successful units prove completed unit teardown and no remaining owned containers;
cancelled units additionally require the exact owned cleanup workflow result.
Public partial attempt/operation/checkpoint observations are retained on failure.
Controller processes, evaluator and owned assertion cleanup precede package/path
cleanup. Owned reservation reconciliation and teardown retry while the key,
database and Temporal connection remain usable. Completed cleanup phases are
retained rather than replayed. Exhausted retries preserve the private runner-temp
recovery context for the final owned cleanup attempt; the key/path is removed
after confirmed teardown. Unresolved cleanup remains explicitly unverified,
retains public operation evidence, and does not become a passing demo result.
The workflow runner remains temporary; this introduces no persistent access.

Local compiler, supervisor, archive/install and isolation-guard tests are
preparation evidence only. Actual App-authenticated scenario execution is still pending.
Runner-local URLs leave external customer endpoint acceptance unverified. No
persistent deployment, paid service, broader App permissions, provider exemption
or phase-order change is introduced. The existing 18 M3 gates remain open.

For cloud independence, reviewed main push activations are also supported:
`releases/m3-customer-installation.json` runs the scope-only stage, and
`releases/m3-customer-demo.json` runs the exact-fixture demo after Work GitHub
publication. Scope validation passed and fixture publication is now recorded below.
Each activation descriptor is reviewed separately before its main merge.
The scope descriptor has `schemaVersion: 1`, purpose
`approved-demo-installation-scope`, full reviewed `harnessBase`, and public `scope`
(repository/App/install IDs only). The demo descriptor uses purpose
`approved-temporary-four-scenario-demo`, the reviewed `harnessBase`, public
`candidate` source/four checksums, and exact `fixtures` excluding `serviceSource`.
The trusted workflow supplies its own full `github.sha`; scripts also verify the
reviewed base is an ancestor. Scope output is public and may be read from normal
Actions logs/artifacts before connector fixture writes. No secret API, PAT bridge,
customer fixture write permissions or manual workflow-dispatch tool is assumed.
Activation requires reviewed prep/CI, actual owner key entry, approved metadata
and parent publication; merging preparation alone starts no customer workflow.

## Scope activation after dashboard integration

The proposed `releases/m3-customer-installation.json` binds the reviewed dashboard
main ancestor `2652ee15b3214a3cc246cbf69f6ca01f8319a36c`, separate App `5182307`,
installation `167710386`, and only `alimobrem/agentci-onboarding-demo`. These IDs
are expected inputs, not a claim of current authenticated identity. The owner
has saved the separate named Actions secret; its value is never inspected here.
Key presence does not establish validity. The trusted main push supplies its own
service source and verifies that the reviewed ancestor belongs to that history.

This descriptor's main merge triggers only the existing read-only App,
installation and selected-repository guard. It writes no customer branches, PRs
or Checks and does not run the temporary demo. Exact-source CI and independent
review precede the separately authorized activation merge. A real hosted
`installation-scope-passed` result is required before fixture publication. The
guard verifies numeric App identity and permissions; it does not verify the App
slug. Expected slug `agentci-onboarding-demo` remains separately unverified.
Missing, invalid, broader or mismatched credentials fail closed. Actual customer execution, external endpoint, authenticated dashboard, milestone
release and aggregate M3 acceptance gates remain pending until their own evidence
is accepted.

The forward CI database cleanup replaces this workflow's committed credential with an independently generated 256-bit password for each attempt. PostgreSQL starts during a step after private credential generation, using the existing pinned image, a private environment file and a random host port bound explicitly to `127.0.0.1`. The runner registers masks for the password and derived URL. Only the private state-file path is exported through `GITHUB_ENV`; the demo controller reads that file in its own Node process, without putting a password in process arguments or exporting a credential value to later steps. Private directories/files use `0700`/`0600` and stay outside workspace archives/artifact paths.

Startup verifies the exact task-owned name, label, image and loopback port using selected Docker inspection fields, then connects with the generated password for an authenticated health check. It never reads or logs the daemon's credential-bearing `Config.Env`. The always-run cleanup first requires a trusted nonsecret teardown-ready proof bound to the exact run/attempt/source/owned namespace. The controller emits it only after verified zero owned assertions/processes/evaluator resources, or before any service session was attempted. If the demo step never executed, its exact skipped outcome plus manager-owned authenticated startup/cleanup proof is required; missing marker alone is not evidence. Both PostgreSQL credential/container destruction and Temporal teardown use this guard. Only then does cleanup recheck ownership, remove the container and its volumes, verify absence and delete private credential files. A nonsecret private cleanup receipt allows a later cleanup step to recheck a startup that already cleaned up after a lost response or health failure. Foreign ownership or uncertain cleanup fails without removing an unrelated container or claiming success. Public cleanup artifacts contain only ownership and cleanup facts, never credentials.

Unresolved, cancelled, malformed or foreign evidence fails closed and retains owned database/Temporal/private state for bounded recovery while the runner exists; no persistent recovery beyond the ephemeral runner lifetime is claimed. Cleanup errors remain public nonsecret evidence.

Local physical tests cover real authentication, wrong-password rejection, selected inspection and removal after an actual create whose response is lost; local guard tests cover private permissions, argument/environment isolation and failure paths. Hosted CI and independent review remain necessary. This forward change does not rotate unrelated keys, rewrite historical commits, claim that no credential was reused elsewhere, or close any customer, endpoint, release or M3 milestone gate.

## Reviewed temporary scenario activation preparation

PR #97 merged as `a39de3fb9e0d4e9beb8343d7e436c2325e9b1b6a`.
Its scope-only run `38490343015` and all four postmerge CI workflows passed;
parent independent actual-scope/postmerge artifact review also passed. The guard
verified numeric App `5182307`, installation `167710386`, minimal permissions and
only the selected demo repository. It does not verify App slug. Scope validation
performed no fixture or Check writes and did not execute the scenarios.

The separately owner-approved fixture publication uses only exact
`customerFixtureFiles()` bytes. New branch `demo/m3-base` is commit
`04f11298c020e853fd0098fb5d92c7529630f300`. Seeded PR #4 has head
`62342e933e902b188b4b87dfa44575cf409ae7d4`; fixed PR #5 has head
`3c12571ec6f4578d19876ce27cf56c842c3abf97`. Both target that new base,
not demo main. All preexisting branch refs and PRs 1–3 were rechecked unchanged.
The head assertion harness is deliberately trivial; only the trusted base
assertion may establish reproduction. These are synthetic acceptance subjects,
not evidence of live model review quality.

The proposed `releases/m3-customer-demo.json` binds these exact public subjects,
the reviewed harness ancestor `a39de3fb`, separate App/install and four immutable
checksums from `v0.4.0-m3-dev.3`, source
`2b8eb75aadd604ebafe97ec06a3359734c4f20d2`. All five public candidate assets
were anonymously downloaded again and matched their verified hashes. Current
harness/dashboard code is separate from this frozen downloaded candidate.

The owner approved a temporary four-scenario run, scoped demo Checks and owned
service cleanup. Activation merge follows exact-source four-gate CI and parent
independent source/artifact review. Publication of this draft alone runs no
customer scenario. Actual unsupported/seeded/fixed/restart/cancellation results
remain unverified until the triggered workflow and retained cleanup evidence are
accepted. No new credentials, access, paid service or persistent hosting is
introduced. HTTPS/OIDC, final `0.4.0-m3` release/download/demo/closure, all three
adapters, full M0–M10 order and the narrow inaccessible-provider exception remain
separate and unchanged.
