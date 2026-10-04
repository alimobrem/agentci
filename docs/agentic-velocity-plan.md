# Agentic delivery velocity: product-plan addendum

Planning decision recorded 2026-10-04 in response to the owner's request to
increase and measure agentic development velocity. The primary specification
remains the implementation baseline. This addendum defines proposed refinements
and prospective measurement; it does not claim these capabilities exist, advance
M3, or waive any phase's release/demo gates.

## Outcome and gap in the original plan

Optimize elapsed time from an accepted change intent to a verified, usable
release, while preserving regression detection, recovery, security and cost.
Treat time to actionable feedback as a leading measure within that outcome.
Code volume, PR count, check duration and agent activity alone cannot establish
customer delivery acceleration.

Spec section 34.2 already names PR cycle time, review time saved, eval runtime,
cost per verified PR and deep human review. Its product metrics are mapped to M8
in the implementation inventory. Section 39 requires early dogfood. Our existing
delivery tools retain task transitions, failed CI attempts, local feedback,
quality events and cache labels, but do not reconstruct the entire change-to-release
critical path, human intervention minutes, agent compute/token cost or burst-load
verification throughput. No historical end-to-end task baseline exists.

## Proposed product refinements and observable acceptance

| Refinement | Concrete behavior | Acceptance experiment | Milestone integration |
| --- | --- | --- | --- |
| Change intent and causal timeline | Link requirement/change intent, agent attempt, exact source, queued/running checks, repair, merge, artifact, deployment and acceptance. Retain superseded/failed work. | A failing then repaired change yields one traversable timeline; retries cannot double-count the delivered change. Missing timestamps/costs remain unknown. | Collect development observations now; M4 instrumentation, M6 release identity, M8 product analytics. |
| Actionable agent feedback | Stable machine-readable failure classification, affected requirement/scenario, reproduction inputs, evidence, retryability and suggested bounded next action. Stream available results without calling them final acceptance. | A coding agent can distinguish assertion regression from unavailable infrastructure and reproduce the failure without scraping prose or receiving reviewer secrets. | Existing M2 contracts are the base; refine contracts in upcoming phase planning before implementation. |
| Incremental verification and evidence reuse | Select affected checks from declared dependencies. Reuse only evidence whose complete relevant source, dependency, runner, policy and assertion identities still match. Explain every invalidation. | Unrelated change reuses eligible evidence; assertion, lockfile, transitive input or policy changes invalidate it; unknown impact falls back to full checks. Shadow full-suite comparisons detect missed failures. | M2 selection remains current baseline; M6 content-addressed evidence, M7 CI integration. |
| Concurrent-change integration | Validate the combined merge candidate against current target state and earlier queued changes. Cancel obsolete work and limit unfinished work when verification capacity is saturated. | Two individually passing conflicting changes fail their combined candidate; stale evidence cannot authorize merge. | Integrate existing GitHub merge queues where available; M6/M7 source/evidence integration. Do not rebuild a Git host queue. |
| Burst capacity and execution budgets | Prioritize fast useful feedback; bound concurrency, per-change trials/time/cost, retries and duplicate work; isolate slow/flaky/provider-sensitive checks. | At 1, 5 and 20 simultaneous changes, report queue delay, feedback latency, completed verified changes, wasted compute, failures and fairness. Over-budget work remains explicit, not silently passed. | Existing M2 budgets/isolation are the base; scheduler refinement requires a scoped upcoming-phase task and acceptance plan. |
| Independent judgement and selective human intervention | Reviewed agents cannot weaken the assertions/policy deciding their own change. Escalation has a specific reason and evidence; policy thresholds require measured calibration. | Test weakening is detected; ambiguous/high-impact decisions escalate; humans are not asked to repeatedly approve already authorized work. | Preserve M2 frozen assertions; M3 independent reviewers, M5 policy, later automation gates. |
| Closed-loop improvement | Each phase identifies its dominant delivery constraint, changes one relevant practice and compares outcome/quality/cost against a recorded cohort. | Retrospective names the measured bottleneck and next experiment; a faster narrow check cannot be reported as an end-to-end win. | Now through the existing retrospective gate; M8 runtime outcomes complete the product loop. |

These refinements need explicit requirement IDs, API/scenario mappings and scoped
phase tasks when adopted into implementation. Planning does not mark mapped M4,
M6, M7 or M8 requirements implemented. New scope must be reconciled with the
primary specification rather than silently added to a closing phase.

## Prospective scorecard

Keep each measure separate; do not combine them into a synthetic velocity score.

- Change intent to accepted usable release: median/P90 elapsed time, with linked
  source/release identity and unfinished changes visible. Intent acceptance time
  is observed, never invented.
- Time to first actionable feedback: median/P90, plus complete verification
  latency. A green fast subset is not final approval.
- Waiting versus execution: queue, runner startup, dependency installation,
  evaluation, artifact publication, human decision and recovery intervals. Attribute
  overlapping steps through the critical path instead of summing concurrent time.
- Throughput: completed independently accepted changes per fixed period; preserve
  requirement identity across PR/task splitting and record work in progress.
- Quality: first-pass success, reopened work, escaped regressions, false positives,
  flaky retries, rollback/change failure and recovery. Distinguish observed zero
  from missing telemetry. Production measures remain unavailable until applicable
  production acceptance exists.
- Cost: compute and model/token cost per accepted change, including failed,
  superseded and retried attempts. Unknown prices/resource accounting stay unknown.
- Human effort: observed intervention count and minutes by reason, with idle
  elapsed time separate. Do not turn an unobserved estimate into a time-saved claim.

Continue the existing append-only delivery records now. At M2 closure, report the
available feedback/CI/task/blocker/quality data and explicitly list unavailable
end-to-end/cost/human measurements. M2 provides a prospective release observation,
not a causal comparison with the substantially different M1 scope.

For each improvement experiment, register the intervention, cohort, baseline,
expected outcome and quality/cost limits before measurement. Compare similar
change risk/size, suite coverage, runner/platform and cache state. Retain all
attempts and unfinished changes; avoid successful-run-only selection when measuring
end-to-end time or cost. Show sample counts and uncertainty. The existing five-run
CI threshold is only a preliminary trend threshold, not statistical proof.
Set an end-to-end improvement target after a comparable baseline exists; the
current 20% local-feedback target does not become an end-to-end claim.

## Immediate execution changes

Finish connected customer-facing slices with focused relevant checks during
construction, then run full applicable CI at integration and release checkpoints.
Keep small logical commits and independent acceptance evidence; avoid repeatedly
running the entire suite after unrelated documentation/checkpoint edits. Full
final-source phase checks, packaging, downloads, release, demo and retrospective
remain mandatory. A new failure, implementation change or unresolved risk can
justify a broader rerun.

M2 hosted self-review remains the current critical path. Complete it and the M2
release; do not begin a speculative new scheduler or analytics service in M2.
Record this plan as a phase-retrospective input and adopt subsequent product work
in milestone order.

## Primary sources informing the refinement

[DORA delivery metrics](https://dora.dev/guides/dora-metrics/) defines throughput
and instability together and cautions against incomparable cohorts and optimizing
a single measure. [The 2025 DORA report announcement](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report)
reports a positive association of AI adoption with throughput alongside delivery
instability; that association does not prove AgentCI's causal effect.
[GitHub merge queues](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
validate the target branch plus changes already queued. Reuse that integration
where available rather than building another merge queue.
