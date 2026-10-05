# Model review Checks: publication slice

Development acceptance for M3-07d-1. This slice supplies the renderer, PostgreSQL
publication source, and authenticated GitHub Checks client calls. It does not
register a background publisher or claim customer evidence routes are deployed.
The task remains in progress until scheduling and real service links are integrated.

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
never appear in links. Only `/v1/model-reviews/{id}` is linked by this slice.
Findings/export links wait for their implemented authenticated routes.

## Retry and concurrency boundary

Every publisher for a subject must use the same PostgreSQL publication source.
It takes the existing advisory publication lock across the GitHub operation,
then reloads the newest admission (ordered by admission creation time and ID) and
its coherent status snapshot. Old owned in-progress Checks are closed neutral as superseded only after a
database comparison proves their admissions precede the selected admission for
this exact subject. Completed results and foreign/unretained Check identities
are preserved. Cleanup writes at most 20 Checks per pass; remaining cleanup
causes a retry and converges across passes. Inventory is bounded at 1000 Checks;
larger histories fail explicitly for operator action rather than silently
searching a prefix. An old admission retry can close only its own obsolete Check,
never a newer one. A retry of
current work rereads terminal state instead of replaying captured progress.
An existing Check is reconciled only when its App ID, name, head and external ID
match. The external ID includes PR/base/head and admission ID. Reconciliation
handles a committed create whose response was lost without creating a duplicate.
The current open PR/base/head is checked after reconciliation reads, immediately
before writing. A stale subject receives no write.

This is serialization among cooperating controllers using the same database,
not an atomic SQL/GitHub transaction. Admission selection and coherent status
reads form the selected publication snapshot; a newly admitted review after
selection is picked up by a later scheduler pass. There is no newest-at-write
guarantee. A PR can change after the final remote read;
GitHub's Checks write lacks compare-and-swap against the PR head. The Check stays
bound to the exact reviewed commit. Manual/external Check writers and controllers
using different databases are outside this lock's guarantee.

## Remaining integration

The following slice must provide durable pending-publication state and bounded
retry/backoff. A status/summary terminal commitment must enqueue publication;
independent termination recovery must enqueue it too. Publication success should
record the acknowledged evidence identity only after the GitHub write, so an
ambiguous response retries through reconciliation. Newer admission/state changes
must leave newer pending work intact. A repeated main-loop scan must not publish
unchanged evidence indefinitely. Schema migration and transition tests belong to
that slice; no in-memory flag is a substitute for restart recovery.

Acceptance so far uses real PostgreSQL and authenticated Octokit requests to an
isolated HTTP server. It exercises lost remote responses, two independent
controller source instances, lock contention, older/newer admissions, stale heads,
terminal retries and preservation of existing Checks. Unit acceptance verifies
identity/digest rejection, refusal/incomplete conclusions, unknown coverage and
credential-bearing origin rejection. Real deployed status URL access, durable
publication scheduling, restart/termination recovery and packaged customer
acceptance remain outstanding. No live provider or GitHub mutation is claimed.
