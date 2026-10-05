# M3 reproduction development demo

This demonstrates the internal M3-06c reproduction path. It is not a milestone
release or the customer CLI/API demonstration planned for M3-07. PR #40 contains
the implementation; final hosted acceptance is recorded separately.

## What the fixture does

The base implementation accepts only the `safe` namespace. The candidate defect
returns true for every namespace. A controller-approved assertion calls the
candidate with `other` and records a structured `namespace-bypass` observation.
A passing observation means the defect was reproduced, not that the product is
healthy. That meaning is explicitly bound by `reproducedStatus` in the plan.

| Fixture | Observed execution evidence | Finding disposition |
| --- | --- | --- |
| Candidate accepts every namespace | Approved bypass assertion passes | confirmed |
| Candidate accepts only `safe` | Approved bypass assertion fails | unconfirmed; not reproduced |
| Assertion crashes | Incomplete/error observations | unconfirmed |
| Queued or running unit is cancelled | Cancelled unit, no execution result | unconfirmed |
| Report is a symlink to `/etc/passwd` | Report export rejected | unconfirmed |
| Cancellation occurs before any unit exists | Durable cancellation; staging rejected | unverified; no execution receipt fabricated |
| Candidate removes the run identity guard and disables its tests | Frozen baseline test still fails | regression detected |

The controller reserves an immutable plan, stages an isolated eval unit, and
passes only its ID to the Temporal evaluator workflow. Execution records are
stored in PostgreSQL. Finalization validates the exact plan/source/assertion/run
identity before retaining a receipt and advancing finding history. Retrying the
operation or reopening the database connection returns the same receipt.

## Repeat the development acceptance

Use the integration environment documented by `.github/workflows/verify.yaml`:
Node 26.10.0, locked dependencies, PostgreSQL, Temporal, and the pinned UBI eval
runner images. Supply database authentication through the normal PostgreSQL
environment, rather than embedding credentials in a URL or this document.

```sh
npm run build
node --import tsx --test tests/integration/finding-reproduction-storage.test.ts
node --import tsx --test tests/integration/finding-reproduction-temporal.test.ts
node --import tsx --test tests/integration/finding-frozen-eval.test.ts
```

Required variables are `AGENTCI_TEST_DATABASE_URL`,
`AGENTCI_TEST_TEMPORAL_ADDRESS`, `AGENTCI_TEST_RUNNER_IMAGE`, and
`AGENTCI_TEST_SELF_IMAGE`. Tests fail when prerequisites are missing. They create
isolated database schemas and owned containers, and remove their test resources.

The storage test exercises actual containers and includes real Temporal success
and live-cancellation paths. The separate orchestration test injects ambiguous
activity responses and cancellation during staging. Both replay Temporal history.
The frozen test runs in the trusted-dependency image with network isolation and
proves that changed candidate tests cannot suppress the baseline assertion.

These fixtures use synthetic reviewer findings and controller approvals. They
prove execution and evidence behavior; they do not prove live provider review,
customer onboarding, production dispatch registration or release distribution.
