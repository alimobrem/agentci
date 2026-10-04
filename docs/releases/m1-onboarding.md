# M1 customer acceptance extension

Distribution version: `0.2.1-m1`. This document records prepublication observations.
For final release identity and acceptance, use the [release assets](https://github.com/alimobrem/agentci/releases/tag/v0.2.1-m1)
and [active gate ledger](https://github.com/alimobrem/agentci/blob/main/releases/m1-gates.json).
Historical `0.2.0-m1` artifacts remain immutable. M2 is not-started.

## Scope added by the user

Fresh-repository customer onboarding and agent/API usage are now explicit release
acceptance gates. Tasks map to the original GitHub App, webhook, Check and evidence
requirements. Customer bootstrap/setup and an evidence client are delivered in
the candidate. Live candidate onboarding has passed; published-build verification remains pending.

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
[customer guide](../customer-onboarding.md), [active gates](https://github.com/alimobrem/agentci/blob/main/releases/m1-gates.json).

First candidate full CI: [37165339669](https://github.com/alimobrem/agentci/actions/runs/37165339669)
passed on source `caf2004dbf38fb54b6594c21fddfd6894815e546`, including real
integration, package/image runtime and scans. Later candidate edits require their
own CI; this prior result does not certify a final release source.

## Remaining acceptance

Candidate customer journey passed on the fresh public repository and separate
private App: signed PR success, action-required invalid input, automatic recovery,
and installed agent client identity/digest/authentication checks. See
[live candidate evidence](../../releases/m1-onboarding-live.json). Still required: matching-source
full CI, integration/API compatibility, packaging, platform images/scans,
publication/download verification, immutable release and user demo.

Created isolated demo: public [alimobrem/agentci-onboarding-demo](https://github.com/alimobrem/agentci-onboarding-demo), private
AgentCI-onboarding-demo (App 5182307, installation 167710386), installed only on
that demo repository with Contents, Pull requests and Metadata read plus Checks
write. The user explicitly approved this separate scope. The existing AgentCI App
remains installed only on alimobrem/agentci. New credentials remain private and
local; no App key was uploaded to another service.

The candidate ran as the isolated agentci-customer Compose project on API port
3002 and Temporal UI port 8234. Colima did not share the temporary key directory;
moving the mode-0600 key into the ignored shared local directory restored the
worker. API readiness alone was insufficient; actual worker state and PR checks
were verified. This host-path prerequisite is recorded in the customer guide.
