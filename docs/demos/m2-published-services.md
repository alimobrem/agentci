# M2 published-service customer checkpoint

This is a preparatory customer checkpoint, not the M2 completion demo. The GitHub
release is still a draft. All six role images were anonymously verified in
`releases/m2-six-role-publication.json`; four service/default-runner roles were
deployed from source `9bcff7d57c40536c9ddec126e998aa97bd045f03`, version
`0.3.1-m2`. The package was installed from that source's verified CI archive;
anonymous public package installation and native six-role acceptance remain open.

The fresh controller uses a new organization, database and Temporal volumes on
local port 3004. A separate read-only/non-root evaluator uses a restricted database
login and the published default-runner digest. The separately approved onboarding
App remains installed on exactly `alimobrem/agentci-onboarding-demo`; the original
AgentCI App and the user's repository-limited token have not been expanded.
The temporary tunnel and shared local daemon demonstrate development setup, not
dedicated production evaluator infrastructure.

## What was observed

1. The installed `agentci review` requested a new attempt for existing customer
   PR #2. Its exact-head Check passed baseline and head trials. The installed
   client consumed the complete certified comparison export and rejected anonymous
   access, an invalid bearer token and a wrong head identity.
2. Disposable [PR #3](https://github.com/alimobrem/agentci-onboarding-demo/pull/3)
   changed the response from `SAFE` to `UNSAFE`. Its head suite already weakened
   the assertion command and threshold. The original main baseline still passed;
   the head failed both trials, with one regression and two critical failures.
   The installed client verified the failed outcome and complete export.
3. The fixture was repaired. A temporary evaluator-only runner-identity mismatch
   produced an explicit cancelled Check and retained cancelled units, with no
   passing behavioral claim. The operator configuration was restored.
4. A fresh CLI request on the identical repaired head passed. Re-reading the
   cancelled Check and authenticated comparison proved that its status and digest
   remained unchanged. A new UUID creates a recovery attempt; repeating a terminal
   failed UUID would only retrieve its existing receipt.

Proofs are `releases/m2-published-service-customer-{bootstrap,passing,regression,
fault,recovery,preservation}.json`. Their source/digest identity and limitations
are explicit. All eighteen M2 phase gates remain pending.

## Repeating the walkthrough

Configure a fresh deployment using the packaged Compose files and the immutable
role references in the verified publication record. Keep the operator config,
App key, webhook secret and evidence token outside Git. Confirm readiness before
opening a synthetic PR with a strict baseline assertion and changed prompt input.

```sh
agentci review --config /absolute/private/operator.json --pr PR_NUMBER
```

Read the behavioral outcome inside the advisory GitHub Check, then use the
authenticated client with that exact repository/PR/base/head/review/attempt to
verify the complete export. The CLI's queued receipt and a neutral Check color
are not behavioral success. Use a fresh UUID after repairing an infrastructure
failure; compare the retained failure digest before and after recovery.

On the local Colima VM used here, macOS `/tmp` is not a shared bind-mount path.
The package contained its migrations, but a `/tmp` deployment initially mounted
an empty directory. API readiness failed visibly. Moving the installed package
and private provider file into the existing shared, ignored workspace path and
applying the shipped migrations in order repaired the preserved new database.
Before deployment, verify that the daemon can read the actual migration/provider
files from their bind-mount paths. No VM reconfiguration or old-volume deletion
was needed.
