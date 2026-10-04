# M1 customer acceptance extension

Version: `0.2.1-m1` candidate. State: in-progress, not released.
Historical `0.2.0-m1` artifacts remain immutable. M2 is not-started.

## Scope added by the user

Fresh-repository customer onboarding and agent/API usage are now explicit release
acceptance gates. Tasks map to the original GitHub App, webhook, Check and evidence
requirements. Customer bootstrap/setup and an evidence client are delivered in
the candidate; live onboarding has not yet passed.

## Verified so far

- 66 unit/API/adapter tests and 14 deterministic evals pass; current service API
  operations are unchanged, with a new version/description and public Node client.
- A clean production-only installed candidate initializes and validates an empty
  customer project, rejects overwrite, imports the client entry point and includes MIT.
- The installed setup command rendered the customer organization manifest page
  and rejected an invalid state with 403 without creating an App.
- The client consumed real localhost evidence from the existing published M1 API,
  verified canonical digest and exact PR/base/head identity, and observed 401 for
  an invalid token. This is backward-compatible client verification, not proof of
  the newly built API images or a fresh GitHub repository.
- Setup configuration and scope tests cover personal/organization registration,
  wrong owners/repos, additional repos, missing/elevated permissions and invalid origins.

[Local observations](../../releases/m1-onboarding-local.json),
[customer guide](../customer-onboarding.md), [active gates](../../releases/m1-gates.json).

First candidate full CI: [37165339669](https://github.com/alimobrem/agentci/actions/runs/37165339669)
passed on source `caf2004dbf38fb54b6594c21fddfd6894815e546`, including real
integration, package/image runtime and scans. Later candidate edits require their
own CI; this prior result does not certify a final release source.

## Remaining acceptance

Real fresh repository and separately scoped private App; signed PR success,
failure and recovery; real agent client against that deployment; matching-source
full CI, integration/API compatibility, packaging, platform images/scans,
publication/download verification, immutable release and user demo.

Proposed isolated demo: public `alimobrem/agentci-onboarding-demo`, private
`AgentCI-onboarding-demo`, installed only on that demo repository with Contents,
Pull requests and Metadata read plus Checks write. Existing AgentCI App remains
installed only on alimobrem/agentci. No App key is uploaded to another service
without separate authorization. The generated local project is prepared under
`/tmp/agentci-onboarding-demo-source`; no external repository/App is created yet.

The earlier instruction and AGENTS.md limit existing App access to
alimobrem/agentci. A separate live test scope therefore needs explicit approval
before creating/installing the demo App. Mock or local proofs cannot close it.
