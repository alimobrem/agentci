# Retained repository-declared intent

SPEC-33.1-002 is supported for an explicit repository declaration at the exact reviewed head. It is a declared intent summary, not generated analysis and not proof that the statement is true. No finding, count, provider result, mutable PR title/body or successful review is substituted for intent. No model calls or external data sharing are added.

The only supported source is `.agentci/intent.json` in the authenticated, verified Git head snapshot:

```json
{"schemaVersion":"v1alpha1","summary":"Explain the intended change here."}
```

The strict document permits only these two keys. The original UTF-8 source must be at most 12,288 bytes; the nonblank summary at most 8,192 bytes. Unsupported versions, malformed data, invalid Unicode and oversized content fail capture without truncation. Absence leaves intent unavailable. This opt-in declaration is retained evidence: do not put credentials, personal data or other private material in it. The existing authenticated evidence-read audience can read its complete original bytes. The dashboard projects only its summary and provenance; source content is not forwarded separately or rendered as markup.

Both M1 review and M2 eval staging capture the declaration from the existing verified immutable Git snapshot. Commit, tree, blob SHA, size and UTF-8 checks precede capture; the retained record includes the original source bytes, Git blob SHA1, content SHA256, full organization/repository/PR/base/head identity, semantic review ID, producer/version and `classification: asserted`. A separate canonical SHA256 binds the complete versioned record. A digest establishes integrity and attribution, never intent truth. Changing title/body at the same commits cannot affect this record because they are never captured. A changed declaration at the same trusted head conflicts instead of replacing retained evidence.

Migration `021_m3_review_intents.sql` adds a separate table and immutable update/delete trigger. Identical concurrent retention is idempotent; conflicting records reject. Existing Analysis, EvidenceRecord, their digests, uniqueness constraints and released compatibility baselines are unchanged. No automatic backfill or arbitrary latest lookup occurs. Existing reviews without captured declarations remain unavailable. Applying migration 021 is required for the new path; legacy `Store.ready` and read APIs do not newly require it. A missing schema sanitizes to service unavailable, not a clean empty review. Original records remain retained with their original capture producer/version across later software upgrades.

`GET /v1/evidence/{id}/intent` uses the existing scoped evidence-read token. Authentication precedes ID validation/lookup; query parameters and mutation methods reject. Scope and integrity failures sanitize to 503; absent review/capture returns 404. The additive SDK `intent(id, expected, {signal})` validates full organization/repository/PR/base/head, exact semantic review ID, trusted record digest, original source bytes and both source hashes. Only 404 maps to unavailable. Corruption, substitution, timeout and cancellation fail closed.

Dashboard server configuration can optionally pin:

```json
{"intent":{"evidenceId":"SEMANTIC-REVIEW-UUID","digest":"sha256:RETAINED-RECORD-HASH"}}
```

These values belong to the trusted admission binding and never come from browser query input. The semantic review ID is distinct from the M3 admission UUID. If a semantic-evidence view is also bound, its evidence ID must match the intent evidence ID. The client shares one consumed network-byte budget and one total deadline/abort signal with all other dashboard reads, counting whitespace/error bodies. The independently retained intent is fetched before the model-summary early return: queued, cancelled, incomplete and refusal states preserve their model execution/evidence states. Plain React text escaping preserves literal markup. Session changes, expiry, revocation, logout, navigation and close cancel held reads; late results cannot disclose prior-account or prior-review intent.

Verification includes strict contract/source-byte fixtures, identity/digest/source substitution and UTF-8 limits, actual authenticated HTTP SDK reads, genuine PostgreSQL/API/SDK roundtrips and M1/M2 producer captures, duplicate/conflicting immutable retention, original evidence digest preservation, and production browser held-socket tests with synthetic declarations. Hosted integration evidence and independent review remain required before merge. Synthetic fixture screenshots are not live OIDC/customer/deployment evidence. No M3 gate, release, legal or live acceptance is closed by this change.
