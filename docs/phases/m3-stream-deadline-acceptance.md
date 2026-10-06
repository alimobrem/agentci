# M3-07e-1: deterministic stream deadline acceptance

The provider corpus's `stream-execution` scenario previously started a 50 ms
wall-clock deadline before calling `streamModel`, then required a reservation
and unknown-charge record. A scheduling delay before the call can legitimately
expire the request before any reservation. In that case the safe result is a
`deadline` failure with `dispatch: not-sent` and no accounting entries.

This test correction uses Node's test clock and explicit iterator/consumer entry
signals. It keeps the 50 ms deadline and distinguishes two lifecycle boundaries:

- Expiry before invocation: no reservation, no provider call, `not-sent` failure.
- Expiry after a stalled iterator or consumer has started: reservation exists,
  no early accounting change at 49 ms, then `possibly-sent` deadline failure and
  unknown-charge accounting at 50 ms. An iterator whose `return()` stalls cannot
  prevent bounded completion. Explicit cancellation still closes the iterator.

Production behavior, test count, provider scenario selection, pass criteria,
compatibility files and evaluation thresholds are unchanged.

## Preserved failure and evidence limits

[Recovery run 37398142115](https://github.com/alimobrem/agentci/actions/runs/37398142115)
completed successfully as a workflow, but its authenticated PR48 comparison
failed `agentci-provider-contracts / stream-execution`: baseline passed, candidate
failed, one trial each. The retained artifact is
[11383867144](https://github.com/alimobrem/agentci/actions/runs/37398142115/artifacts/11383867144).
The compared subjects were base `55d54b71473db3c9a29dc0ef9cfae46c094272b1`
and candidate `1d95a9e74413c6b9aaf772cf991c80955481a946`. Provider source, the
stream test and the provider harness were identical across those subjects.

The harness retains scenario status but discards individual TAP failures, so the
exact hosted subtest cause is not proven. A prior local fast run observed the
same deadline assertion mismatch (`[]` versus `reserve, unknown`). A controlled
60 ms pause after setting the old 50 ms deadline reproduced it. The original
hosted export and the temporary diagnostic copy/log remain in
`/private/tmp/agentci-customer-advisory-37398142115`; they were not overwritten.

## Local acceptance and trusted promotion

- Focused stream tests: 5 passed, no failures or skips.
- Provider corpus: all five scenarios passed.
- Provider harness mutation verifier: clean subject passed; a deliberately
  weakened response identity guard was detected as `response-contract` failed.
- `npm run check:fast`: all ten checks passed (3.74 seconds), including
  340 tests with zero failures or skips.

The stream test belongs to `runner.harness`. Hosted comparisons deliberately use
the baseline's frozen copy, so this candidate change alone cannot repair a
comparison whose baseline still contains the old test. This is an explicit,
reviewable corpus correction, not permission to substitute candidate assertions.
After review and applicable CI acceptance, trusted-main promotion and a fresh
comparison against that promoted baseline are required. PR48 remains unresolved
by these local results alone. No GitHub rerun, merge, compatibility baseline
rewrite or release completion is included in this change.
