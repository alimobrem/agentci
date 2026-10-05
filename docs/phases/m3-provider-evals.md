# Frozen provider-core eval corpus

M3-01-evals closes a behavioral coverage gap found while inspecting PR 28's
comparison in advisory run 37278034182. The existing self-contract suite tests M2
contracts; its passing scenarios cannot substantiate provider-core requirements.

`evals/agentci-providers.yaml` declares five scenarios: normalized requests,
normalized responses, stream consistency, bounded invocation and streamed execution.
The harness freezes the corresponding 27 assertions and request fixture while
executing provider modules from the reviewed subject. Dependencies come from the
pinned trusted runner. Assertions cover instruction roles, schemas, parameters,
metadata, namespaced extensions, cancellation/retry boundaries and accounting order.
PostgreSQL durability and real provider compatibility retain separate gates.

The harness rejects incomplete, skipped, cancelled or missing tests instead of
counting them as a pass. `scripts/verify-provider-eval.mjs` runs the corpus in a
temporary copy, weakens request-identity validation there, and requires the response
scenario to fail. It never changes the working source. Deadline assertions use
controlled timers to avoid machine-speed-dependent failures.

Local acceptance passed all five baseline scenarios and rejected the weakened
identity guard. CI retains this verification as `releases/provider-contract-eval.json`.
Hosted run 37324182838 passed all five provider scenarios in the isolated runner
for source `29f8d73d7bac00851abbe837ce806854e6e55061`. The retained comparison
passed file-digest, chained-export, subject and runner identity verification; see
`delivery/acceptance/m3-01-evals-initial.json`. Full CI run 37324180104 also passed
the mutation check, integration, API, package and container checks (warm cache).

The provider suite exists only on the head in this first comparison. That first run did not close the task. Hosted run 37326306682 subsequently
executed all five provider scenarios against both subjects in PR29 and PR30,
using identical baseline assertion revisions within each comparison. Both passed;
file digests, chained exports, subject and runner identities were verified.
`delivery/acceptance/m3-01-evals.json` records the accepted corpus task. PR28
still used the pre-corpus baseline in this run, so its two-sided acceptance remains
open. The provider implementation itself is unchanged
from this PR baseline; this is corpus adoption, not a provider behavior change.
A newly introduced suite
does not retroactively clear old coverage gaps; later comparisons must use the
accepted baseline harness, and earlier attempts remain retained.

This change also carries the original provider-core acceptance record from the
adapter branch into main. All recorded core source hashes were revalidated before
starting this dependent task. It does not mark any live adapter or M3 release complete.

Hosted follow-up 37326326634 also verified PR28 at head `6c008309` against
merged baseline `54db2608`: both sides passed the same frozen provider assertions
with no execution gaps. `delivery/acceptance/m3-02-frozen-corpus.json` retains
the verified comparison identity and digest. This closes the earlier PR28 corpus
gap without changing its separate pending live-provider acceptance.
