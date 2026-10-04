# Configuration and adapter authoring

AgentCI extends existing delivery systems through explicit, versioned boundaries.
This guide describes code currently on main. M1 `0.2.1-m1` is the latest released
milestone; eval extensions below require the unreleased M2 candidate. Do not
expect the M1 download to execute these examples. M2 publication/download/customer
acceptance remains a separate release gate.

## What can be configured or extended?

| Surface | Current behavior | Limit |
| --- | --- | --- |
| Repository config | `agentci.yaml` selects specs, implementation, evals, policies, prompts and review tool/permission/model-config paths | Strict schemas reject unknown keys; selecting a file is not an arbitrary policy-language interpreter |
| Eval manifests (M2) | Scenarios/requirements, impact selection, adapter argv, frozen harness paths, trials/thresholds, deadlines/output limits, model variants | Model IDs are eval inputs, not an implemented model router |
| Custom local evals (M2) | `native` structured JSON or single-scenario `command` exit codes in an operator-selected isolated image | No repository-controlled image, privileges, endpoints or App credentials |
| Existing engines (M2) | pytest/JUnit, optional Promptfoo/JSONL and DeepEval/pytest normalization | Install dependencies in a reviewed image, not from PR code during execution |
| External eval services (M2) | `http` provider protocol with operator-selected endpoint, pinned IP/revision and separate credentials | Provider identity/protocol evidence is not independent proof of its remote execution |
| Deployment | API/controller/evaluator scope, database/Temporal connection, engine, immutable images and execution budgets | Current service deployment is repository-scoped; broad tenant/organization configuration is not fully implemented |
| Provider/SDK/platform extensions | Provider adapters M3, instrumentation M4, MCP M5, release/CI evidence M6, Tekton/OpenShift M7, alert adapters M8 | Planned boundaries; no published general-purpose dynamic plugin SDK today |

`spec.extensions` is a namespaced configuration escape hatch, not a loader for
third-party executable modules. The adapter names are a closed validated enum:
adding an engine name currently requires a reviewed core contribution. The public
npm export currently exposes the agent client, not a supported adapter SDK.
The spec's organization→repository→branch→PR configuration layering remains a
product requirement; do not infer a complete merge engine from the YAML schema.

## Path 1: wrap your tool as a native eval

Usually the simplest extension is a wrapper around your existing test/eval tool.
Declare requirements in your project, then add a suite such as
`evals/custom.yaml` (the requirement below exists in AgentCI; use your own
registered requirement ID in your repository):

```yaml
apiVersion: agentci.io/v1alpha1
kind: EvalSuite
metadata:
  id: custom-contract
spec:
  class: contract
  requirements: [SPEC-40-035]
  impact:
    categories: [source]
    include: [src/**]
  runner:
    adapter: native
    command: [node, evals/custom.mjs]
    report: custom-result.json
    timeoutMs: 30000
    maxOutputBytes: 1048576
  scenarios:
    - id: multiplication
  trials:
    count: 3
    passRate: 1
    maxCriticalFailures: 0
    confidenceMethod: wilson
```

For an illustrative subject exporting `multiply` from `src/answer.mjs`, the
wrapper `evals/custom.mjs` performs an actual assertion and emits one trial:

```javascript
import {writeFile} from 'node:fs/promises';
let status;
try {
  const {multiply} = await import('../src/answer.mjs');
  status = multiply(6, 7) === 42 ? 'passed' : 'failed';
} catch {
  status = 'error';
}
await writeFile('custom-result.json', JSON.stringify({
  schemaVersion: 'v1alpha1',
  results: [{scenario: 'multiplication', status}]
}) + '\n');
process.exitCode = status === 'passed' ? 0 : 1;
```

AgentCI owns the three-trial loop; your wrapper emits one observation per
invocation. Every declared scenario must appear exactly once. Use `passed`,
`failed`, `error` or `skipped`; exit 0 must agree with success, and exit 1 with
failed/error assertions. Report optional measured `latencyMs`, `costUsd` and
integer `totalTokens`; absent observations stay absent. Never turn transport,
missing dependencies or evaluator crashes into passing assertions.

Run `agentci validate` from your installed **M2 candidate** CLI. Local manual
execution can verify the wrapper format, but only the isolated runner verifies
production execution boundaries. Configure the operator's pinned runner image and
follow [evaluator deployment](eval-worker.md) to request real PR comparisons.
There is no public `agentci adapter install` command.

Existing baseline suites and assertion files under the configured eval namespace
remain frozen when evaluating head code. Put additional assertion dependencies in
`runner.harness`; changing a head assertion must not remove a regression. Subject
implementation still comes from the requested commit. See
[comparison semantics](eval-comparison-api.md) and [hosted evals](hosted-evals.md).

## Path 2: implement an HTTP evaluation service

Use this when the tool is remote or needs a separate trust/resource boundary.
Start with [HTTP provider protocol](http-eval-provider.md), which contains the
normative request/response, identity, transport and retry requirements.

1. Implement authenticated POST handling for `HttpEvalRequest`/`HttpEvalResponse`
   `agentci.io/v1alpha1`. Validate the complete envelope, actual provider revision,
   scope, bounded inputs and scenario mapping before evaluation.
2. Keep the provider ID opaque in the repository suite. Configure endpoint, pinned
   IP, immutable revision, optional CA and separate authorization in the trusted
   evaluator's private `AGENTCI_EVAL_PROVIDERS_FILE`; it must not be group/world
   readable. Register matching `{id, revision}` entries in the controller's
   `AGENTCI_EVAL_PROVIDER_IDENTITIES`. Neither belongs in PR-controlled configuration.
3. Return HTTP 200 and uncompressed JSON with every required identity echoed
   exactly: request UUID, source SHA, effective input digest, suite/provider
   revisions and model when requested. Return each declared scenario once.
4. Atomically deduplicate within authenticated provider/revision scope by request
   UUID **and the complete canonical request digest**. A matching retry returns
   the retained response; a conflicting payload fails. Keep state for your
   supported retry window and document downstream interruption/billing behavior.
5. Treat received files as untrusted customer data. If your service executes code,
   isolate it yourself; AgentCI's HTTP transport does not sandbox your service.
   Do not execute input with provider/control-plane secrets or expose raw inputs
   in logs. Enforce capture/retention and resource policies on your side too.

Production transport requires verified HTTPS, pinned IP and hostname verification;
redirects and compressed responses are rejected. Loopback plaintext is limited to
explicit test policy and is rejected by the deployed evaluator. Stable request
IDs help deduplication; they do not guarantee exactly-once external side effects.
Schema files ship under `dist/packages/evals/json/` in the package; their source
forms are under `packages/evals/json/` in the repository.

## Conformance before claiming compatibility

| Case | Expected result |
| --- | --- |
| Valid pass, actual assertion failure | Correct normalized behavioral result and exit/report agreement |
| Missing/duplicate/undeclared scenario, unknown field or malformed report | Rejected; cannot pass |
| Empty tests, skipped scenario or missing trials | Infrastructure error or insufficient evidence, never success |
| Timeout, cancellation, oversized output, disconnect or invalid TLS | Explicit bounded infrastructure failure and cleanup |
| Wrong source/input/suite/provider/model/request identity | Rejected before evidence can satisfy the requested comparison |
| Same request ID/same payload, then conflicting payload | Retained response, then conflict rejection; no fabricated fresh observation |
| Modified/deleted head manifest or assertion | Baseline comparisons remain intact; suite changes/coverage gaps visible |
| Worker interruption/restart | Retained checkpoints reused; uncommitted execution may repeat with stable request identity |
| Fresh installed package/image | Same behavior from actual distribution; mocks or source imports are insufficient |

Existing suites provide reusable examples, not a standalone public conformance
package: `tests/eval-adapters.test.ts`, `tests/eval-http.test.ts`,
`tests/eval-request-id.test.ts`, and real integration cases in
`tests/integration/eval-engines.test.ts` and `eval-http-recovery.test.ts`.
Document your supported protocol/engine versions, limits, failure semantics,
credential scope, retention, upgrade path and license. Do not claim support from
one successful example or an API-shaped mock.

## Contributing a new built-in adapter

Begin with a small tracked task and requirement/scenario mapping. Extend the
validated suite/schema contract, command setup and normalization in
`packages/evals/contracts.ts`, `packages/evals/json/eval-suite.schema.json` and
`packages/evals/adapters.ts`. Synchronize OpenAPI/domain mappings and shared
fixtures. Keep engine-specific behavior behind its boundary, use upstream output
formats and preserve strict failure/provenance semantics.

Add meaningful parser negative cases, actual installed-engine pass/failure/error
and isolation/recovery acceptance. Review dependency licenses/security and pin
image/lock inputs. Run applicable contract/API compatibility/integration and
packaging checks. Document version/migration decisions rather than editing a
baseline to conceal breakage. Provider/model adapters planned for M3 need their
own capability/stream/retry/budget conformance contract; the HTTP eval protocol is
not a substitute for that interface.
