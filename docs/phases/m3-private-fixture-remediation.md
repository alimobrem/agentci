# October 22 private fixture construction and replacement

PR #117 is retained at head `d304ff11c52c691d0ba12c42569650a2c1abb3e5`
(tree `b0a4dc2f52958c23398435006ff0dfa271a7bdc4`). Its two secret-protection
attempts, `39834644157` and `39834690833`, each retain five unresolved
`agentci-password-assignment` findings in the changed evaluator runtime blob.
The matched source lines contain two per-attempt random-generation expressions
and three references to those values. Those lines are byte-identical to main
and the preceding head; no credential literal was identified in these five
matches. This classification does not clear the unchanged gate. Its complete
introduced-history scan continues to include that published blob after any
append-only correction.

The owner approved a substantive fixture refactor and a replacement draft PR,
with fresh checks and independent review before merge. Task
`M3-private-fixture-remediation-20261022` was started before implementation.
A separate branch begins at exact main
`5e89f95caddfa327bf5397c3a3dbc107a67f8e32`; the reviewed package-lock,
Next 16.4.2 and Docker 29.9.2 remedies are applied as an uncommitted final snapshot.
Only the final corrected snapshot will enter that new branch's first commit.
PR #117, its original branch and all failed evidence remain intact. No published
history is rewritten and no scanner rule, ignore, threshold or finding is suppressed.

## Private configuration contract

One fixture-only builder replaces duplicated credential-to-connection,
environment and Temporal Compose construction. It must add useful shared input
validation, transport encoding and serialization, rather than quote keys,
split strings or rename variables merely to avoid a detector. All of its source
and tests remain subject to the unchanged policy.

Preserve two independently fresh cryptographic fixture credentials, restricted
PostgreSQL roles and grants, exact service/network/socket topology, private
mode 0600 files, read-only/capability/isolation controls, redaction and owned
cleanup. These generated test credentials confer no new production access.
Prove actual construction, parser/encoding equivalence, unsafe-input rejection,
file isolation and non-disclosure locally, then exercise actual database and
evaluator behavior in the required hosted checks.

## Native scan diagnostics

Original evaluator native attempt `39834649266` built both images on both
architectures, then each worker-scan command exited 1 before producing scan JSON.
It retained source/image bindings and harness owned-zero/private-removal proof;
runtime was not started. CLI/Go/Temporal and three-unit acceptance were not
established by those failed matrix artifacts. The underlying scanner cause is
unknown because its diagnostics were not retained.

The bounded correction reuses the existing privacy-preserving scanner-failure
classifier: categories, status/signal, channel sizes and hashes, with raw output
withheld. Bind the shared helper in exact source inputs and workflow triggers,
and retain the optional failure member in the artifact hash index. Preserve the
current scan command, pinned image, sandbox, timeout/output limits, strict
vulnerability policy and every mandatory source/image/scan/runtime/cleanup
success record. A missing or unclassified diagnostic never becomes a pass.
Archive transport changes are not included in this correction.

## Required new evidence

The replacement draft must freshly pass the exact introduced-history scanner,
standard Verify including package installation and all six service-image scans,
Dashboard Verify, and native AMD64/ARM64 dashboard and evaluator proofs. Retain
all failed attempts, actual artifacts, exact source/tree/head/run/attempt bindings
and explicit cleanup qualifications. Independent exact-head and actual-artifact
review precedes the authorized merge; postmerge checks bind the actual merged
source. Earlier source/artifact proof is not relabeled as new execution.

All 1,346 requirements, original M0–M10 scope and 18 pending M3 gates remain in
place. Candidate ARM64 package proof, live provider/OIDC/customer acceptance,
licensing/source-notice residuals, existing service findings and historical
cleanup uncertainty remain separate. Immutable dev.3/dev.4 artifacts are unchanged;
no release publication or customer activation occurs in this change.
