# Remaining disposable CI database hardening

Verify, advisory review and native downloaded acceptance create an owned database
after generating fresh credentials in a private runner directory. Only the state
file path enters `GITHUB_ENV`. The existing audited database helper authenticates
health, verifies a random loopback port, checks ownership before removal, and keeps
private recovery state when cleanup cannot be established.

Trusted host commands receive database authentication in their process environment
through `ci-database.mjs run`; credentials never enter command arguments. Its output
filter handles credentials crossing stream chunks. Native download acceptance also
scrubs the retained integration JSON, preserving outcomes and counts. Malformed or
unsafe artifacts are removed from upload paths; native uploads require its safe
redaction output flag. The helper
and smoke harness come from the workflow revision, while migrations, suites,
configuration and downloaded images remain bound to the release source.

Advisory review checks out the workflow commit, retains its separate evaluator and
App key boundaries, and removes the App key before database cleanup. All three
workflows retain a bounded cleanup receipt. Unknown startup outcomes and failed
owned cleanup fail the job. Detached trusted command groups receive bounded
TERM/KILL shutdown and are checked for remaining executing members. Private command
receipts prevent database removal while command recovery is unresolved. The drain
deadline starts at child exit, error or cancellation, before waiting for inherited
pipes or queued destination writes. Unverified closure also withholds the artifact
upload flag and removes the retained integration JSON.

Image smoke generates separate fresh database, webhook and evidence credentials.
Private environment files transport them to Docker create/exec; Docker receives
only the host PATH. PostgreSQL has no host port. Per-run labels bind containers,
network and volume; inventory and ownership checks precede removal. Success is
printed only after verified zero owned resources and private-file removal. State is
registered before daemon writes, and both calling workflows run owned recovery
after cancellation, including hard interruption. PostgreSQL tmpfs storage avoids
an anonymous volume outside the ownership inventory. Storage acceptance checks
selected mount metadata, the exact HostConfig tmpfs path and the actual filesystem
type; Docker may report an empty Mounts array for this tmpfs. Signals delivered
during final cleanup still withhold runtime success. Bounded stage diagnostics
identify failures without engine or service payloads. Failure
retains private recovery state and reports a bounded receipt without service logs.

Regression transports are explicitly synthetic. Hosted native execution, scanner
results and independent source/artifact review are separate acceptance evidence.
These changes do not erase old commits or identify the unmatched GitGuardian alert.
Release publication remains paused until its separate prerequisites are satisfied;
all existing milestone gates and three model adapters remain required.
