# Development publication token diagnostic

The second dev.3 preflight failure, run 38215995488 at source
5682c67208fdd4eedfcb3fa90deaf161de852831, retained the same push-visibility
assertion failure. Artifact 11731627776 SHA256
a85eea4aef6aab0af607c8e503799f95bcd7260e4304b6d296b398c87eaae026 was
independently inspected. It does not distinguish a non-true permissions.push
field from a repository identity mismatch. No release ID or uploaded assets
were recorded; downstream jobs were skipped. Do not infer an occupied or absent
candidate identity from this failure.

Use the standalone development-token-diagnostic workflow after exact-source
review and hosted checks. Its main push trigger is limited to its own workflow
file. It uses the existing publication-preflight ephemeral contents-write and
packages-read grants with the same Node/npm pins, but invokes only a fixed
repository metadata GET. It does not invoke candidate publication, registry
inventory, fixture creation or any write API. Candidate descriptor/version,
existing publication workflow and capability/collision controls remain unchanged.

The committed workflow and checkout bytes must match. Evidence includes only
source SHA, operation/result, HTTP status, permissions-object presence, push-field
presence/type/boolean value and whether the repository identity matches. Neither
raw responses, returned names, arbitrary errors, credentials nor App keys are
retained or printed. JSON is printed in the job log and retained in the bounded
development-token-diagnostic artifact. Token grant metadata in hosted setup logs
must also be verified. Local mocked observations are not the real response.

The observation does not itself prove draft visibility or candidate availability.
Use the actual evidence to decide a bounded correction, then retain all applicable
tests, independent review, hosted scanner/Verify, authenticated paginated draft
inventory, occupied identity refusal, native builds, immutable asset publication
and anonymous downloads. Preserve both failed dev.3 attempts and failed dev.2.
All M3 gates remain pending; UI stays draft.
