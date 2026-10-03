# AgentCI trace mapping v0.1

M0 design contract; SDKs and OTLP export begin in M4. Implements the design work
in specification sections 14, 16, 30 and 38, not their runtime behavior.

Use OpenTelemetry spans and OTLP, never a custom trace protocol. Capture externally
observable execution, never hidden chain-of-thought. Each adapter must pin its
upstream semantic convention revision and record `agentci.trace.mapping.version`
as `0.1`. Recheck GenAI attributes during M4 and version adapter changes.

| Operation | Span intent | AgentCI compatibility operation |
| --- | --- | --- |
| Agent invocation | Internal orchestration span | agent.invoke |
| Model invocation | Client span for provider call | model.invoke |
| Explicit planning phase | Internal span for externally exposed phase | agent.plan |
| Tool invocation | Client/internal span according to transport | tool.invoke |
| Handoff | Link to receiving execution | agent.handoff |
| Policy decision | Internal span with decision metadata | policy.evaluate |
| Human approval | Separate span/link and approval reference | approval.record |
| External effect | Sanitized classification and target reference | effect.record |
| Eval annotation | Span linked to execution under test | eval.run |

Store these operation values in `agentci.operation`, not the reserved `gen_ai.*`
namespace. Adapters map applicable model/agent/tool metadata to upstream conventions
and retain AgentCI attributes for correlation. HTTP/RPC spans use existing
transport instrumentation.

| Attribute | Type | Meaning |
| --- | --- | --- |
| agentci.project.id | string | Stable project identity |
| agentci.repository.id | string | Stable repository identity |
| agentci.git.sha | string | Full immutable commit ID |
| agentci.pull_request.number | integer | PR number when available |
| agentci.agent.release | string | Immutable release identity |
| agentci.spec.digest | string | SHA-256 specification digest |
| agentci.eval_suite.digest | string | SHA-256 suite digest |
| agentci.policy.digest | string | SHA-256 policy digest |
| agentci.capability.id | string | Normalized action identity |
| agentci.incident.id | string | Incident identity when available |
| agentci.environment | string | Environment classification |
| agentci.autonomy.level | string | Effective autonomy classification |

Never invent unavailable lineage. Record provider/model identity, duration, token
counts, error type, and cost estimates where available. Distinguish provider errors
from behavioral failures. Evidence references use trace/span IDs and backend URLs;
the relational control plane does not duplicate full trace storage.

Propagate W3C `traceparent` and `tracestate` across supported downstream calls.
Use span links for async jobs, retries, evaluations and approvals where parenthood
would imply incorrect timing or causality. Trace context is correlation data, not
authentication. Optional Kubernetes correlation labels follow cardinality and
sensitivity policies.

Capture defaults to metadata-only. Independently configure model input/output,
tool arguments/output, retrieved context, and system instructions. Modes: none,
metadata-only, redacted, full-encrypted, customer-local. Absent per-field policy
inherits the global mode. Metadata-only/none omit content; redacted requires
redaction before export; full-encrypted requires approved encryption/access policy;
customer-local content stays in the customer boundary. Never put secrets in span
attributes, baggage, or errors.

M4 tests must verify default content omission, independent capture controls,
lineage propagation, W3C context, backend export, and error classification using
captured exports. M0 includes no exporter.

References: [OpenTelemetry GenAI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/),
[W3C Trace Context](https://www.w3.org/TR/trace-context/).
