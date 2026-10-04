# M2 release readiness

M2 is a development candidate. M1 `0.2.1-m1` is the latest released milestone;
M3 remains not-started. Component acceptance does not close milestone gates.
The authoritative release ledger is `releases/m2-gates.json` and the phase scope
is `docs/phases/m2.md`, specification section 40 M2 and section 11.

## Verified component evidence

- Default isolated native/pytest execution, optional installed Promptfoo/DeepEval,
  statistical trials, frozen baseline/head comparisons and scoped persistence are
  exercised by fourteen mandatory native integration groups without skips.
- Authenticated comparison API, complete bounded exports and installed client
  identity/digest checks have exact-source CI and actual customer acceptance.
- Independent controller recovery has source/tree/artifact-verified CI
  `37206277572`, real running-container/evaluator/reconciler failure tests and
  installed customer termination/fresh-attempt proof. See
  `releases/m2-controller-recovery-ci.json` and
  `releases/m2-controller-recovery-customer-local.json`.
- The recovery-guidance correction has passing local feedback, compatibility,
  native groups, production packaging and installed customer evidence discovery.
  Its source/tree/artifact-verified full CI is `37206981627`, recorded in
  `releases/m2-recovery-guidance-ci.json`. The aggregate manifest/normalization
  criterion is audited in `releases/m2-contract-acceptance.json`.

## Remaining closure work

1. Finish the full PR/phase requirement audit against exact-source component
   tests and final release behavior. Guidance and aggregate manifest/normalization
   component acceptance now pass; phase acceptance remains pending.
2. Complete `M2-HOSTED-DOGFOOD`. The existing trusted-main hosted workflow still
   performs M1 semantic review. M2 behavioral self-review must use isolated
   evaluators and retain source-bound evidence before exact-head publication,
   without a laptop or secrets exposed to reviewed code.
   The local self-runner foundation now passes six frozen contract scenarios,
   regression/test-weakening and incomplete-execution probes, all fifteen native
   groups without skips, and a zero-finding arm64 image scan. Evidence is
   `releases/m2-hosted-self-runner-local.json`; exact-source foundation CI
   `37210326532` is verified in `releases/m2-hosted-self-runner-ci.json`. The
   connected hosted controller/evaluator/artifact pipeline now has local native
   and real-repository prepare acceptance. Its final-source CI, main adoption,
   actual hosted publication and released acceptance remain pending.
3. Complete `M2-SECURITY-RELEASE`. Include inventories and scanner coverage for all
   introduced service/runner/optional-engine platforms and current official pins.
   The optional image has `node-forge` 1.4.0 / GHSA-86w9-cpqp-85rv. The official
   advisory checked 2026-10-04 lists no patched version. Provide an upstream fix
   or concrete applicability evidence and explicit release treatment; this document
   does not waive the finding or claim a clean optional-engine scan. The local
   downstream backport now matches pinned upstream source and passes the RSA
   regression suite and all fourteen native groups. Exact-source x64 CI
   `37208366195` also passes, with verified tree and artifact hashes in
   `releases/m2-forge-backport-ci.json`. Other scanner coverage and digest-bound
   published-platform remediation records remain pending.
   The official Podman 6.1.3 remote client additionally contains two HIGH gRPC
   findings. Combined-client CI attempts `37217458910` and `37218263332` fail scan policy; native binary
   analysis confirms affected symbols are present. See
   [native security evidence](m2-native-security.md). No exemption or clean-scan
   claim is made. The owner approved Docker-only M2 packaging; Podman adoption
   and its unresolved findings remain deferred with decision evidence in
   `docs/m2-container-engine.md`. Released Docker platforms still require their
   own complete scan, inventory, execution and recovery acceptance.
4. Finish requirement/status, customer setup, migration/upgrade/rollback,
   observability, architecture and release documentation against final behavior.
   Review delivery metrics with comparable suite/cache/runner cohorts; faster local
   feedback alone is not proven total development acceleration.
5. Build and publish immutable versioned UBI API/controller/evaluator/default
   runner/optional-engine images for claimed platforms, with source metadata,
   licenses, digest pins and scans. Verify actual registry pulls and deployment.
6. Publish the complete GitHub release, packages, checksums and configuration
   examples. Verify anonymous downloads and installed artifacts independently.
7. Replay the real customer success/regression/failure/recovery and installed
   agent/API demo using released artifacts. Deliver the user demo and M2
   retrospective, then close all applicable phase gates before M3.

Official security source:
[node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
