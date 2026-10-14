# Customer evaluator and settlement recovery correction

The owner approved this bounded repair in response to proposal
`Sentinel_62008bec6cfc8191955a87e12f2acef5`, with “yes fix it please”
(`Sentinel_97e73167863881919d9be20c096d59c8`, 2026-10-14 16:08 UTC).
It covers repair, safe diagnostics, real failure/recovery regressions, publication,
CI and merge after independent source and actual artifact review, followed by the
same four customer scenarios. No new permissions, credentials, release publication
or persistent service are authorized by this correction.

## Evidence and limits

Run `38580528645` at `ee69dcb318e778ecbabfa3ad3171e1de2f6c91d6`
completed the unsupported scenario and acknowledged the seeded reservation. It
retained no terminal seeded/fixed/recovery observations. Both cleanup artifacts
establish only recovery required or unverified. The independent audit and actual
artifact hashes remain in `m3-customer-recovery-parent-audit-38580528645.json`.
Earlier run `38510993755` had independently verified cleanup; that evidence cannot
prove cleanup for this later attempt. Runner termination cannot substitute either.

A local reproduction used the original evaluator helper and actual pinned public
worker image. Create succeeded, then full Docker inspection exceeded its 8192-byte
output limit, including reconciliation inspection. The owned fixture was separately
identified before removal; no real credentials were used. This proves a reachable
initiating defect with the actual image, not the missing original hosted exception
or the sole cause of that failure. The command categories and byte counts are in
`m3-customer-evaluator-inspection-reproduction.json`.

Pulling that large image exhausted this cloud filesystem. Read-only disk checks
confirmed the capacity problem. Removing only the new task-owned image restored
space; the original release archives and source/evidence were preserved. No access,
registry, quota or authentication workaround was used. The smaller actual Docker
regression proves projection on large metadata and never claims to execute the
published evaluator image or complete the customer scenarios.

## Resulting behavior

Docker inspection returns only ownership, execution and isolation fields needed
by the existing guards. Environment variable names support exclusion checks;
values and unrelated image labels are excluded. Commands have bounded output and
time limits. Exact image/name/owner checks remain required before deletion.

Normal startup verifies the evaluator before restoring the worker. During failed
startup cleanup, exact retained intent is reconciled and cancellation is durably
requested before a drained worker is restored. This prevents a never-staged
reservation from being staged during recovery. Stale exited entries are replaced;
a live PID alone is insufficient: the installed worker must poll the exact owned
Temporal namespace/task queue, after checking applied repository authority.
Settlement polling rechecks worker liveness, and staged work additionally requires
an owned running evaluator. Cancellation alone is never settlement proof.

One abort signal fences cleanup phases, status/cancellation requests, worker
restarts, evaluator commands and subsequent disposal. PostgreSQL lock/statement and
connection operations have server/client bounds. Completed cleanup phases remain
retained and concurrent closes join. After unsuccessful bounded recovery, only
owned controller/evaluator resources and their connections are quiesced. Private
key/files and infrastructure remain retained; unresolved assertion or settlement
state cannot become a zero-cleanup receipt. Late aborted work cannot advance to
later cleanup phases. A second finalization fails promptly after quiescence.

The retained diagnostic journal is capped at 256 allowlisted events: phase,
outcome, owned process PID/exit code/signal, evaluator command/state/failure class
and selected dispatch/settlement state. It excludes raw exceptions, process output,
environment values, credential contents, paths and arbitrary labels. Successful
cleanup also retains per-operation terminal settlement digests.

## Validation and remaining gates

Real installed-package tests use owned PostgreSQL/Temporal and a strictly signed
synthetic GitHub transport. They exercise actual review/approval/reservation;
fixture transport is not live customer acceptance. They cover evaluator startup
failure after ACK, worker death during cancellation, stalled observations/abort,
and foreign evaluator identity or unavailable engine. Actual Docker projection
also rejects a foreign assertion runner proof, but does not claim a fully staged
foreign assertion cleanup scenario. Existing actual evaluator isolation/recovery
acceptance and the customer retry remain required.

The combined local production install initially failed when its owned Temporal
service panicked during internal scanner startup (exit 2, not OOM-killed). Removing
only a local CPU cap did not resolve it. Inspection of environment names confirmed
automatically injected proxy settings. A controlled test kept those settings and
limited only that temporary container's NO_PROXY/no_proxy to approved internal
loopback addresses. All 14 installed reader and five worker/recovery checks then
passed, with Temporal healthy beyond the scanner startup window and owned resource
cleanup verified. This supports a local internal self-dial routing explanation;
it does not identify the original customer failure. No host/global proxy, external
route, authentication, workflow or server feature changed. Failed attempts remain
retained in the regression proof.

Applicable local checks and exact-source hosted CI, then independent source and
actual artifact review, must pass before merge. The frozen dev.3 assets and PR4/PR5 fixture subjects remain unchanged. The
automatic retry descriptor change has been removed from this correction: a
separately verified production dispatch defect in dev.3 requires a corrected
candidate decision before the customer retry. No known-broken immutable asset is
patched or silently substituted. All aggregate M3 gates remain pending.
Dashboard, HTTPS/OIDC, license inventory, durable evidence, final immutable release,
anonymous downloads and released-build demo obligations remain in milestone order.
All three adapters and observed-rate calibration/Wilson descriptive treatment are
preserved; only inaccessible external-provider tests have the owner-approved
explicit deferral exception.


## Independent review corrections

Parent review of PR #100 superseded the earlier local review on two concrete
points. Terminal status must be read before recovering either consumer: a staged
cancellation can settle between observations, so an unavailable evaluator must not
hide authentic terminal evidence. Polling now reads authenticated status first,
recovers consumers only while unsettled and reads again. Existing exact unit and
owned assertion-container zero checks remain mandatory. The installed regression
uses real staging, cancellation, restricted evaluator cleanup and authenticated
receipt-retained settlement, with zero trials and no execution-success claim.

The original final join timer did not cover quiescence. The corrected lifetime
arms a final shutdown deadline before quiescence and joins pending cleanup and
callbacks under that deadline. Session ownership is latched before abort; tracked
own PostgreSQL transports and the own gRPC client are closed, and any late pool
connection is closed too. Borrowers retain responsibility for `release()`; stealing
that release caused a reproduced double-release crash and was removed. Owned
controller and Docker command subprocesses are explicitly tracked for termination.
An AbortError is not a process-death certificate: command ownership persists until
actual exit/close, and TERM-ignoring command regressions cover both supervisors.
An unresolved create outcome also cannot turn empty inventory into owned-zero
proof; it remains recovery required until exact ownership is reconciled.
Quiescence invokes no new diagnostic callback. Its fast failure or deadline expiry
uses an explicit trusted-entrypoint fallback: force only owned handles, persist
allowlisted unverified evidence synchronously with atomic replacement, then exit
that harness process with status 1 even if persistence fails. Private recovery
state remains retained, and no teardown-ready or owned-zero receipt is created.
The default budgets are up to 120 seconds for cleanup plus 10 seconds for final
shutdown; no operating-system or uninterruptible-I/O termination guarantee is
claimed. Two real PostgreSQL/Temporal subprocess cases test lifetime timeout,
stalled query/SDK close/diagnostic callback, retained key/database, dead owned child,
live foreign sentinel and no late phase, including persistence failure.

The diagnostic snapshot additionally carries validated public harness source,
GitHub run/attempt and candidate source/package/manifest/image/publication hashes.
This binds failure artifacts without copying environment values or credentials.

The staged test also found a separate, concrete production defect: dispatch passed
its `shouldStop` function into `ReproductionDispatchStore.bind`, which uses
`structuredClone`. The actual frozen dev.3 dispatch module reproduces
`DataCloneError` before SQL binding. Its source fix projects only the data fields
`taskQueue`, `evalTaskQueue` and `config`. A real database/Temporal regression now
supplies the callback, and a distinctly identified unpublished locally packed
source candidate passes installed staging and cancellation. The public dev.3
archive/image is unchanged and still contains this defect. Corrected candidate
publication requires the separate authorization and publication gates; this PR
cannot establish a successful customer retry on the original frozen asset.
This does not recover the original hosted exception or prove its sole cause:
the reproduced inspection failure can occur before the worker reaches dispatch.

Original PR head `09848b0` passed all four hosted CI runs. Those attempts remain
retained, and do not clear these independent review blockers. The changed head
requires its own full CI and parent independent source and actual-artifact review
before merge. Customer retry and release authorization remain separate.
