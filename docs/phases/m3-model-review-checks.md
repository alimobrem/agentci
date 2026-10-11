# Model review Checks: publication slice

Development acceptance for M3-07d-1. This slice supplies the renderer, PostgreSQL
publication source, and authenticated GitHub Checks client calls. The [durable scheduler](m3-model-review-publication-scheduler.md) registers the optional
background publisher. PR #73 merges status, findings, history and export links
with authenticated HTTP/installed-client acceptance; exact-source hosted Verify
`38159199274` passed. They are bearer-authenticated API URLs, not implemented
dashboard deep links. Deployed GitHub/customer and current combined-tree
acceptance remain separate requirements.

The separate `agentci/model-review` Check binds organization, repository, PR,
base/head SHAs, admission ID/digest, profile revision, retained summary digest,
role result digests and finding event references. Existing deterministic
`agentci/review` and behavioral `agentci/evals` Checks are untouched.

Completed model execution produces a neutral advisory Check, including empty
finding sets. Synthetic execution explicitly describes fixture-only coverage.
Refused/incomplete roles and failed/cancelled/terminated/timed-out execution
produce `action_required`. Queued/dispatched work remains in progress, and absent
summaries mean unknown coverage. No model claim is promoted to a confirmed defect,
merge blocker, successful behavioral verdict or whole-repository guarantee. The
renderer displays retained finding references rather than interpreting subsequent
mutable dispositions. A later verified disposition integration must authenticate
its reproduction/operator evidence before changing conclusion policy.

The output is bounded below GitHub's summary limit and escapes text. Status links
contain only the operator-owned origin and validated admission UUID; credentials
never appear in links. Status and export links are emitted for retained admissions. Findings-index links
are emitted only when a retained summary exists; a queued or partial review has
no complete findings index. Each summary finding links to its authenticated
current history with the exact review ID. Original finding-event digests remain
in the output and index even after later dispositions. Links read evidence when
opened; current history/export may include later lifecycle events. Require the
verified end frame plus EOF or the client completion certificate for a complete
export. Configure an independent private `AGENTCI_CURSOR_KEY` in the control
service for findings/history routes; the deployment origin must serve these
authenticated routes. Tokens are supplied in authorization headers, never URLs.

## Retry and concurrency boundary

Every publisher for a subject must use the same PostgreSQL publication source.
It takes the existing advisory publication lock across the GitHub operation,
then reloads the newest admission (ordered by admission creation time and ID) and
its coherent status snapshot. Old owned in-progress Checks are closed neutral as superseded only after a
database comparison proves their admissions precede the selected admission for
this exact subject. Completed results and foreign/unretained Check identities
are preserved. Admission ordering for the bounded remote inventory is checked in one SQL
query, avoiding per-run queries. Cleanup writes at most 20 Checks per pass; remaining cleanup
causes a retry and converges across passes. Inventory is bounded at 1000 Checks;
larger histories fail explicitly for operator action rather than silently
searching a prefix. An old admission retry can close only its own obsolete Check,
never a newer one. A retry of
current work rereads terminal state instead of replaying captured progress.
An existing Check is reconciled only when its App ID, name, head and external ID
match. The external ID includes PR/base/head and admission ID. Reconciliation
handles a committed create whose response was lost without creating a duplicate.
The current open PR/base/head is checked after reconciliation reads before the
cleanup batch, and checked again immediately before the selected Check write.
A known stale subject receives no write.

This is serialization among cooperating controllers using the same database,
not an atomic SQL/GitHub transaction. Admission selection and coherent status
reads form the selected publication snapshot; a newly admitted review after
selection is picked up by a later scheduler pass. There is no newest-at-write
guarantee. A PR can change after the final remote read;
GitHub's Checks write lacks compare-and-swap against the PR head. The Check stays
bound to the exact reviewed commit. Manual/external Check writers and controllers
using different databases are outside this lock's guarantee.

## Remaining integration

The durable scheduler retains generations, leases, acknowledgments and bounded
retry/cooldown in migration013. See its acceptance record for process-death and
ambiguous-response recovery; link integration preserves those contracts.

Acceptance so far uses real PostgreSQL and authenticated Octokit requests to an
isolated HTTP server. It exercises lost remote responses, two independent
controller source instances, lock contention, older/newer admissions, stale heads,
terminal retries and preservation of existing Checks. Unit acceptance verifies
identity/digest rejection, refusal/incomplete conclusions, unknown coverage and
credential-bearing origin rejection. Compiled local status/findings/history/export links now verify exact retained
admission/summary references and authenticated access before and after an
operator disposition. Queued export coverage remains incomplete and stale heads
receive no link rewrite. Existing scheduler restart/recovery evidence is retained.
Live deployed GitHub/customer acceptance remains outstanding. The current combined
tree needs its own hosted verification; the PR #73 result does not transfer to a
changed tree. HTTP fixtures do not claim live provider or customer GitHub execution.
