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

## Approved progression exception — 2026-10-06

The owner approved this narrower completion policy at **2026-10-06T02:34:57Z**:
inaccessible external model-provider validation may remain **deferred/unverified**
without blocking progress **only after every other applicable gate passes**.
The structured decision is [m3-provider-validation-exception.json](../../releases/m3-provider-validation-exception.json).
This permits qualified M3 closure and progression after those gates pass; it does
not make the original live-provider requirements complete or remove any M0–M10 scope.

The exception covers only upstream compatibility/quality validation for
SPEC-13.3-002/003/004 and the real different-provider validation portion of
SPEC-40-050 (the external-provider portions of M3-C15/C16). Implementations,
internal fixtures, independence-policy enforcement, APIs, security, actual GitHub
customer acceptance, packaging, published downloads, release, delivered success
and failure demos, and recovery still require evidence. SPEC-40-051 remains
mandatory: unsupported claims stay explicitly unconfirmed. Synthetic provider
identities never establish live compatibility, quality or independence.

The final requirement audit must preserve those original IDs and mark the affected
validation deferred/unverified with this decision and its resume conditions.
The consolidated closure record must cite the decision in its limitations and
requirement audit; all eighteen release gates still need applicable evidence.
The release notes, README and user demo must disclose the limitation. No gate,
requirement or adapter task is promoted to passed by this approval. Resume the
original live acceptance when access and any necessary spend authorization become
available; do not discover credentials, create accounts or make paid calls under
this exception.
