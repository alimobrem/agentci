# M3 admitted reproduction consumer — implementation in progress

This consumer connects an already-reserved, explicitly approved finding reproduction to Temporal and the isolated evaluation worker. It does not complete M3 or enable public reproduction/disposition actions. The released customer demo and release gates remain open.

## Operator ownership and startup

The catalog is an operator-owned JSON artifact with `schemaVersion: v1alpha1`, deployment `organizationId`, `repository`, and `plans`. Each entry contains the complete compiled `plan` and its canonical `sha256:` digest. Commands originate in the approved compiled plan, never in a queue request. Catalog files must be mounted outside pull-request writable paths.

Before reserving the first operation, use the catalog readers to validate and explicitly apply a `ReproductionOperatorConfig` through `ReproductionAuthorityStore.apply(config, expected)`. Initial application uses `expected: null`; later revisions require the exact previous revision and digest. This is an explicit operator action, separate from worker startup. The configuration validator recompiles each enabled approved plan against the authenticated historical finding and exact base/head snapshots. Revocation tombstones prevent re-enabling a revoked plan. The deployment operator command below applies this configuration. Public customer mutation routes and the full customer onboarding demo remain separate gates.

Enable the controller by setting all four variables:

- `AGENTCI_REPRODUCTION_CATALOG_FILE`: absolute path to the operator artifact.
- `AGENTCI_REPRODUCTION_CATALOG_DIGEST`: canonical SHA-256 of that JSON document.
- `AGENTCI_REPRODUCTION_CONFIG_REVISION`: expected positive integer applied revision.
- `AGENTCI_REPRODUCTION_CONFIG_DIGEST`: canonical SHA-256 of that applied configuration.

Without these variables, reproduction is disabled. Partial configuration is an error. Loading is bounded to 32 MiB and validates scope and identity; startup only reads the expected applied identity. An independent `AGENTCI_CURSOR_KEY` is also required for authenticated historical finding reads; it must not reuse the evidence or operator token. The existing isolated evaluator queue is `agentci-eval-v1`. Drain old controller/evaluator workers and readers and apply the migrations before enabling this consumer; mixed deployments have not been accepted as safe.

After reservation, immutable scoped database plans are authoritative. A present catalog entry must match the retained plan; corruption does not fall back to the catalog. Removing an artifact is not a revocation. Use an explicit configuration revision to revoke approval.

## Explicit configuration application

Use the compiled deployment operator command on a trusted controller host with its scoped database, App and cursor-key environment. It is packaged under `dist/cmd/reproduction-operator/main.js`; it is not a public API request. From an installed package, replace `dist/` in these commands with `node_modules/agentci/dist/`.

1. Prepare the operator catalog of compiled plans and a configuration JSON document. Each enabled approval references the **historical pre-queue** finding version/digest and the complete queued plan ID/digest, plus an explicit expiry. See `packages/findings/reproduction-config.ts` for the exact schema. Scope must match the deployment. The initial document has revision 1.
2. Compute the canonical digests, never a raw file-byte hash. From the built checkout:

   ```sh
   node --input-type=module -e 'import {readFileSync} from "node:fs"; import {canonical,digest} from "./dist/packages/review/engine.js"; console.log(digest(canonical(JSON.parse(readFileSync(process.argv[1],"utf8")))));' /absolute/path/catalog.json
   node --input-type=module -e 'import {readFileSync} from "node:fs"; import {canonical,digest} from "./dist/packages/review/engine.js"; console.log(digest(canonical(JSON.parse(readFileSync(process.argv[1],"utf8")))));' /absolute/path/config.json
   ```

3. Set the four reproduction environment variables above to the catalog path/digest and **target configuration** revision/digest. Stop the controller before changing startup identity. Apply migrations using the deployment's normal migration procedure; the command does not migrate or start workers.
4. For the initial application, run:

   ```sh
   node dist/cmd/reproduction-operator/main.js apply --config /absolute/path/config.json --config-digest "$AGENTCI_REPRODUCTION_CONFIG_DIGEST" --expected initial
   ```

   Success prints only `{"applied":{"revision":1,"digest":"sha256:…"}}`. It validates authentic finding history and exact source snapshots, writes configuration, and queues no reproduction or evaluator job.
5. For Compose development, add `-f deploy/reproduction.compose.yaml` to the existing deployment command so the catalog is mounted read-only at the container path. Build/use the M3 worker image matching the tested source, and apply all migrations before starting it. The base M2 images do not implement this consumer. Start the configured controller and isolated evaluator. A queued operation requires its separate approved reservation; configuration alone does not start work. For a later revision, use `--expected 'PREVIOUS_REVISION:sha256:PREVIOUS_DIGEST'` and the new target identity. An exact retry of an ambiguously completed apply uses the **same original expected identity**. A stale expectation or changed replay fails. To revoke a plan, set its approval `enabled` to false in the next revision; that plan cannot be re-enabled.

Config files are bounded to 64 KiB and pinned before a privileged connection is opened. Config bytes, credentials and backend exception text are not printed. Invalid arguments and unavailable application exit 2 with distinct bounded error codes. A success is a configuration-application result, not passing behavioral evidence. Operator updates and workflow recovery remain deployment-scoped.

## Execution and recovery contract

Preparation validates detached bounded inputs before taking the authority transaction. Staging uses the same database connection and transaction as fresh permission, expiry and current queued-finding checks. Evaluation identifiers become dispatchable only after commit and post-commit cancellation validation.

Only retained operation and attempt identifiers enter the parent workflow. The exact parent workflow type, queue, memo, binding digest, historical configuration and run identity are checked before adoption. Ambiguous starts are reconciled against the deterministic workflow ID, including a delayed start from a prior lease. Dispatch and recovery run independently.

A database terminal unit is insufficient evidence of physical cleanup. Settlement requires verified terminal parent/unit observations, completion of the exact owned cleanup workflow, and authenticated retained receipt or non-execution proof linked to finding history. Receipt-before-history crashes remain recoverable. An operator supersession preserves actual evidence rather than replacing it. Unavailable execution never becomes a passed result.

Cleanup uses retained execution identity and does not depend on fresh approval being available. Failed cleanup can retry only the exact owned type, queue and memo. Original and retry run identities remain evidence. Cancellation, confirmed permission denial, approval expiry/revocation and infrastructure unavailability retain distinct causes. A completed trusted permission read returning false stops execution; a timeout or transport error remains unavailable. Failed permission checks roll back provisional evaluator rows before any identifiers escape. Expired approval stops before remote source reads and produces an explicitly unverified non-execution record.

## Evidence boundary

The focused catalog/loader, PostgreSQL settlement and real Temporal orchestration tests prove their individual contracts. Temporal tests using evaluator doubles do not prove isolated execution. Local consumer acceptance includes actual isolated positive/negative/error execution, evaluator SIGKILL checkpoint recovery and parent termination with owned-container cleanup after revocation. These fixture results do not replace hosted or released customer acceptance. Public API/CLI mutation round trips, provider coverage, M3 UI, released success/failure demos, packaging/publication/download verification and complete release acceptance remain required. See `delivery/tasks.json`, `docs/definition-of-done.md` and the acceptance reconciliation for authoritative status.
