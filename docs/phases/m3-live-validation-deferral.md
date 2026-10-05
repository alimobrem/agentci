# M3 live-provider validation deferral

Approved by the owner on 2026-10-05: continue reviewer roles, finding handling,
APIs and the dashboard without requiring new provider accounts. Defer live
multi-provider acceptance; do not claim the original M3 scope fully complete.
This decision supersedes the mandatory three-provider live-smoke prerequisite
in the original M3 plan. The primary specification remains unchanged for traceability.

## Preserved scope and evidence

M3-02, M3-03 and M3-04 retain their original acceptance criteria, start dates,
blocker history and implementation. Their remaining live validation is deferred,
not passed. SPEC-13.3-002/003/004 remain visible as deferred acceptance.
SDK transport fixtures, outage tests, packaging and frozen provider-core comparisons
are evidence of those tested boundaries, not real upstream compatibility.

M3-05 now depends on accepted provider core M3-01 and preflight M3-R2. It will
exercise seven reviewer roles and independence policy through deterministic
provider fixtures. Fixture upstream identities must be clearly identified as
synthetic; distinct fixture identities do not prove real-provider independence.
Findings, API/check integration, authenticated dashboard, isolation, robustness,
packaging, publication, anonymous downloads and release/demo gates remain required.

## Release and demonstration boundary

A fixture-backed release/demo must explicitly identify synthetic responses and
pending live validation in the README, release notes, demo and closure audit.
Do not describe it as a live multi-provider customer review or full original M3
completion. No gate is marked passed by this decision. Applicable evidence remains
required; any live-only closure exception must cite this decision explicitly.

A future live customer demo needs one user-configured provider. A real
`differentProvider: true` demonstration additionally needs trustworthy coding
provider provenance distinct from the review provider; two configured providers
suffice for a fully live two-provider demonstration. Three accounts are not a
prerequisite for continued development. Unknown provenance must still fail the
independence policy. No paid calls or credential discovery are authorized here.

Resume deferred acceptance when the user elects to configure providers and grants
spend authorization. Preserve stable budget identities and the existing private
configuration/preflight protections. No compatibility claim is promoted solely
because the fixture-based release succeeds.
