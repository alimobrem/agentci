# Request or retry a review as an operator

The M2 candidate adds `agentci review`. This command queues a review; a queued
receipt does not mean evaluation passed or the phase is complete. M1's published
CLI does not contain it yet. Build this source candidate or use the M2 package
after publication.

The operator uses the deployment's existing repository-scoped App key and webhook
secret. The evidence bearer token is read-only and cannot schedule work. Keep
operator credentials outside project data and source control. This command never
reads repository configuration to discover credentials and never executes
repository code locally.

Copy `deploy/review-operator.example.json` to a private location and make it
mode 0600. Set the exact repository, App ID, installation ID and AgentCI service
origin. Point `privateKeyFile` at the existing private RSA App key and
`webhookSecretFile` at a private text file containing the existing webhook secret.
Both must be regular mode-0600 files; relative paths resolve from the config
location. Symlinks and group/world-readable files are rejected. Do not put an
App key, token or secret directly in the JSON or a CLI argument.

```sh
agentci review --config /absolute/private/operator.json --pr 2
```

The command reads the current open PR from GitHub using that installation,
validates its repository, PR number and distinct exact base/head SHAs, then sends
an HMAC-signed request through the existing webhook endpoint. The controller
rechecks current PR identity before execution and publication. No new public
HTTP write endpoint or permission grant is introduced. HTTPS is required except
for loopback development; redirects are refused.

Successful stdout is a versioned JSON receipt containing `requestId`,
`status` (`queued` or `duplicate`), `workflowId` and the exact review `subject`.
The request UUID identifies a fresh immutable attempt. Use a new attempt after
an evaluation failure or cancellation; retained prior evidence is not rewritten.
The App and operator requests use the same durable outbox.

If submission fails after the server may have accepted it, stderr contains a
sanitized JSON error with `code: submission-unknown` and the request UUID.
Retry with that same UUID to recover the receipt without creating another job:

```sh
agentci review --config /absolute/private/operator.json --pr 2 \
  --request-id UUID_FROM_THE_AMBIGUOUS_SUBMISSION
```

An unchanged subject yields a duplicate receipt. If the PR moved, that UUID
conflicts rather than changing the retained attempt; fetch a fresh identity and
request a new attempt. A duplicate receipt does not rerun an already finished or
cancelled workflow. Do not use it as the recovery mechanism for a terminal failed
review. The optional request ID must be UUIDv4; new requests generate one locally.

Exit code 0 means a validated queued/duplicate receipt. Exit code 2 means failure.
Errors disclose only stable codes and, where applicable, a request UUID. GitHub
SDK errors, App authentication, secret-file paths and remote response bodies are
not echoed. Response bodies are bounded and their receipt identity is checked.

Use the authenticated comparison client to verify the eventual result and
complete export. Operator receipts contain no evidence token. See the
[operation/scenario map](../specs/api/operator-review-operations.json) and
[development customer demo](demos/m2-development.md). Production-only package smoke, all fourteen native integration groups and real
customer acceptance through the installed CLI/client passed; the recorded
[local proof](../releases/m2-operator-review-local.json) includes exact source
hashes and the retained Check identities. Exact-source full CI 37202131590 passed 122 unit/API/domain tests and fourteen
native integration groups, with zero skips, released-M1 compatibility, packaging
and UBI service/evaluator probes. Source trees and artifact hashes are verified
in [the CI checkpoint](../releases/m2-operator-review-ci.json). Milestone
publication and released-build acceptance remain separate gates.

Cancelled or unavailable behavioral Checks direct you to create a fresh attempt
after resolving its cause. When staging produced a comparison, the Check links
to retained authenticated evidence and its complete export, with review/attempt
identity. Use the deployment evidence token through the client; tokens are not
embedded in links. Pre-stage failures have no comparison link. Repeating the old
request UUID recovers only its receipt and does not rerun a terminal attempt.
