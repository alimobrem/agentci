# M1 security coverage and disposition

The release uses pinned UBI 10 minimal, checksum-verified official Node 26.10.0
archives for amd64/arm64, and locked npm dependencies. Direct dependencies were
rechecked against npm latest tags on 2026-10-03; none were outdated. Node remains
Current, with native Temporal startup/replay/shutdown covered by runtime checks.

The publication workflow scans each published API/worker platform by immutable
manifest digest using pinned Trivy 0.75.0. Full JSON inventories and database
metadata are retained with release evidence. Fixable HIGH/CRITICAL findings block
the scan gate. Any remaining finding needs explicit assessment before completion;
a successful policy command alone does not dispose of unfixed findings.

Trivy recognizes UBI OS packages, installed npm dependencies and the distributed
Temporal core-bridge Cargo lockfile. Cargo lock scanning describes source
requirements shipped by the vendor; it is not binary-level proof that every
compiled dependency exactly matches that lock. The Node archive includes native
components, and the Temporal SDK supplies native prebuilds. These vendor artifacts
are obtained from official releases/registry packages and checked against the
committed version/integrity inputs. Their compatibility is exercised at runtime.
No claim is made that static scanning proves the absence of vulnerabilities in
all compiled vendor code. Revisit coverage on upgrades or new vendor advisories.

The review boundary does not execute reviewed Git scripts, hooks, dependencies,
workflows or eval commands. Exact commit/tree/blob identities, content limits,
configured access scopes, signed webhook bytes, replay handling, evidence auth,
immutability and stale-head rejection have tests. GitHub-hosted dogfood executes
only trusted main code; the App key is an encrypted repository secret. Reviewing
changes to main workflows/dependencies remains necessary because they can use
that key. Its installation stays limited to alimobrem/agentci.

See the final release manifest and scan artifacts for observed findings and their
disposition. This assessment establishes the coverage boundary; it is not a
substitute for those results. No production SaaS hardening claim is made in M1.
