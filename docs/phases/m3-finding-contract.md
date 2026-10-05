# M3-06a model-finding contract

Development implementation; task acceptance remains pending hosted checks.
The versioned model-finding contract is separate from the released deterministic
Analysis contract. It retains exact subject, synthetic/external mode, source
reviewer result digests, original claims and selected file references.

`findingsFromReviewer` accepts a controller-authenticated retained reviewer result
and its matching context. The model supplies only category, severity, claim and
source references; additional state/confirmation/blocking fields fail validation.
Content hashes and line ranges must match the selected source/requirement document.
Diff text cannot substitute for source lines. Missing context is a failure, not an
empty successful review. A refused or incomplete reviewer produces no finding.

Claim normalization uses NFC and whitespace folding, retaining the original claim
on its source. Every original claim must normalize to the retained claim. Source
ordering uses explicit code-unit comparison, independent of host locale; canonically
equivalent Unicode spellings retain stable ordering even when input order reverses.
Duplicate identity hashes exact organization/repository/PR/base/head,
mode, category, normalized claim and sorted evidence. Different source evidence
or different commits remain separate. Severity is the maximum among exact duplicate
claims; all distinct reviewer sources remain retained. No fuzzy merging is claimed.

Lifecycle transitions validate the expected version and return a prior-record hash
with the new record. A controller-owned receipt reader authenticates the writer,
policy and retained evidence before returning a receipt. The module checks finding
and subject identity, reproduction assertion digest, actor class and outcome.
Repository/model bytes cannot provide that reader. Confirmation requires a matching
reproduction receipt; a negative result or execution error remains unconfirmed.
False-positive and resolved dispositions require operator receipts with reasons.
Requeueing retains prior evidence through the event store planned in M3-06b; this
pure module alone does not persist history or implement concurrency control.

Default blocking requires confirmed evidence at the configured severity. An explicit
authenticated customer override may block an unconfirmed external finding while
preserving its actual state and policy digest. Synthetic records, false positives
and resolved findings cannot block. Agreement count is not a blocking input.

Validators establish structural integrity, not authentication. The controller must
verify retained result/receipt provenance and enforce authorization. M3-06b owns
immutable storage and M3-06c owns isolated execution and receipt production; neither
is claimed implemented here. Customer endpoints remain M3-07.

The API operation map and shared fixture live in `specs/api/finding-operations.json`
and `specs/api/fixtures/model-finding.json`. `tests/findings.test.ts` covers source
binding, forged fields, duplicate order, lifecycle paths, stale versions, wrong
receipts, redacted outages and policy overrides. Build assets include both schemas;
the installed-package smoke validates the shipped finding fixture.

The frozen `agentci-finding-boundaries` suite runs these five assertions. A local
mutation verifier disables finding-ID receipt matching and requires the suite to
fail. This proves detection of that concrete bypass, not live model quality.
Hosted acceptance is still pending.
