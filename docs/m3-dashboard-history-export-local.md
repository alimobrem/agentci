# Local read-only history and export slice

The dashboard uses the existing finding-history and model-review-export APIs through
the authenticated server-held SDK. Browser input selects a finding from the exact
saved admission; it does not select an organization, backend origin, profile or
credential. Summary-pinned evidence and a later captured history watermark are
displayed separately. Operator disposition is not a verified fix, cancellation
intent is not cleanup, and complete evidence is not a passing review.

Both frontend GET mediators authenticate the original captured session cookie,
validate the strict configured admission, authorize its organization/repository,
join request and session interruption, and recheck that original session after all
reads. Responses use private no-store caching. Backend credential failures remain
502, distinct from an expired/revoked user session (401). No backend mutation or
cancel/disposition route is called.

The SDK verifies the original admission, fixed history watermark, cursor progress,
contiguous versions, lifecycle and digest/reference integrity. No history buffer
is released until the iterator finishes naturally with a final null cursor. Every
export frame, including end, remains provisional until actual EOF and the SDK's
separate complete certificate. The BFF returns only the complete buffered result.
The browser also checks the transport envelope, identity and digest chains, then
freshly checks its non-authorizing session view binding before displaying the
result and again before creating a download.

The downloaded NDJSON contains the authoritative header/reviewer/finding/end wire
frames. The certificate is displayed separately, not appended as an extra wire
frame. Production browser fixtures round-trip the actual downloaded bytes through
the authoritative export verifier. Buffers and object URLs are discarded on
interruption, unmount, pagehide or identity-prop changes. Closing a read aborts its
HTTP request, without cancelling a backend workflow.

The existing 15-second dashboard deadline and 8 MiB cumulative raw SDK read budget
apply to each traversal, including repeated admission reads. Authoritative SDK
per-frame, history and export bounds also apply. These are operational limits,
not model-quality acceptance thresholds. Oversized or incomplete evidence fails
closed; the slice does not provide partial exports or resume tokens.

Tests use explicitly test-only signed/session/backend fixtures and an actual
production Next build. Local Chromium reuse and pinned private dependency/tool
caches are recorded separately from hosted browser bootstrap. No live OIDC,
provider, customer, deployment, native packaging, public download or full M3
acceptance is established by these fixtures. The existing 18 phase gates remain
pending. Hosted and independent review evidence must bind the final source.
