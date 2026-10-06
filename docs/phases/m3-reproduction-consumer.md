# M3 admitted reproduction consumer — implementation in progress

This consumer connects an already-reserved, explicitly approved finding reproduction to Temporal and the isolated evaluation worker. It does not complete M3 or enable public reproduction/disposition actions. The released customer demo and release gates remain open.

## Operator ownership and startup

The catalog is an operator-owned JSON artifact with `schemaVersion: v1alpha1`, deployment `organizationId`, `repository`, and `plans`. Each entry contains the complete compiled `plan` and its canonical `sha256:` digest. Commands originate in the approved compiled plan, never in a queue request. Catalog files must be mounted outside pull-request writable paths.

Before reserving the first operation, use the catalog readers to validate and explicitly apply a `ReproductionOperatorConfig` through `ReproductionAuthorityStore.apply(config, expected)`. Initial application uses `expected: null`; later revisions require the exact previous revision and digest. This is an explicit operator action, separate from worker startup. The configuration validator recompiles each enabled approved plan against the authenticated historical finding and exact base/head snapshots. Revocation tombstones prevent re-enabling a revoked plan. Customer-facing setup tooling is still pending; this internal API is not a completed onboarding guide.

Enable the controller by setting all four variables:

- `AGENTCI_REPRODUCTION_CATALOG_FILE`: absolute path to the operator artifact.
- `AGENTCI_REPRODUCTION_CATALOG_DIGEST`: canonical SHA-256 of that JSON document.
- `AGENTCI_REPRODUCTION_CONFIG_REVISION`: expected positive integer applied revision.
- `AGENTCI_REPRODUCTION_CONFIG_DIGEST`: canonical SHA-256 of that applied configuration.

Without these variables, reproduction is disabled. Partial configuration is an error. Loading is bounded to 32 MiB and validates scope and identity; startup only reads the expected applied identity. An independent `AGENTCI_CURSOR_KEY` is also required for authenticated historical finding reads; it must not reuse the evidence or operator token. The existing isolated evaluator queue is `agentci-eval-v1`. Drain old controller/evaluator workers and readers and apply the migrations before enabling this consumer; mixed deployments have not been accepted as safe.

After reservation, immutable scoped database plans are authoritative. A present catalog entry must match the retained plan; corruption does not fall back to the catalog. Removing an artifact is not a revocation. Use an explicit configuration revision to revoke approval.

## Execution and recovery contract

Preparation validates detached bounded inputs before taking the authority transaction. Staging uses the same database connection and transaction as fresh permission, expiry and current queued-finding checks. Evaluation identifiers become dispatchable only after commit and post-commit cancellation validation.

Only retained operation and attempt identifiers enter the parent workflow. The exact parent workflow type, queue, memo, binding digest, historical configuration and run identity are checked before adoption. Ambiguous starts are reconciled against the deterministic workflow ID, including a delayed start from a prior lease. Dispatch and recovery run independently.

A database terminal unit is insufficient evidence of physical cleanup. Settlement requires verified terminal parent/unit observations, completion of the exact owned cleanup workflow, and authenticated retained receipt or non-execution proof linked to finding history. Receipt-before-history crashes remain recoverable. An operator supersession preserves actual evidence rather than replacing it. Unavailable execution never becomes a passed result.

Cleanup uses retained execution identity and does not depend on fresh approval being available. Failed cleanup can retry only the exact owned type, queue and memo. Original and retry run identities remain evidence. Cancellation, denial and infrastructure unavailability retain distinct causes.

## Evidence boundary

The focused catalog/loader, PostgreSQL settlement and real Temporal orchestration tests prove their individual contracts. Temporal tests using evaluator doubles do not prove isolated execution. Full consumer tests with the actual evaluator, API/CLI mutation round trips, provider coverage, M3 UI, released success/failure demos, packaging/publication/download verification and complete release acceptance remain required. See `delivery/tasks.json`, `docs/definition-of-done.md` and the acceptance reconciliation for authoritative status.
