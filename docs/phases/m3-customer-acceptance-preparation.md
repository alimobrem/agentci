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

Before actual acceptance, obtain explicit authorization for customer fixture
branches/commits/PR updates and scoped Check writes, plus the selected cloud
deployment/endpoint. Obtain exact installation/repository identity and approved
private configuration through the existing secure mechanism. The manifest lists
the required immutable artifact, authority, subject and observation data. Current
approval requests for service draft publication/PR71 merge do not authorize these
additional customer mutations. No new persistent access, paid service or Mac
tunnel is required or assumed by this preparation.

Demonstrate seeded defect, unsupported claim, fixed-head result and failure/restart
on downloaded exact-source artifacts. Reproduction confirmation/fixed results
require actual isolated execution and retained trusted evidence; operator
attestations and local fixture success cannot substitute. Verify end frame plus
EOF/client completion for exports and anonymous download provenance. Preserve
all three adapters and the narrow upstream-provider exception. M3-07/R1, UI and
milestone release/demo acceptance remain separate and pending.
