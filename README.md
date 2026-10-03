# AgentCI

AgentCI is an engineering control plane for AI-generated and agentic software.
It connects specifications, code changes, evaluations, and release evidence so
reviewers can understand what changed and how it was verified.

The first product goal is a GitHub pull-request check that explains changes to
requirements, permissions, tools, models, prompts, and risk. Later milestones add
runtime tracing, production feedback, and controlled repair. Git, existing CI,
OpenTelemetry, and deployment systems remain the integration foundations.

## Current state

The M1 build adds deterministic semantic PR review, signed scoped webhook
receipt, PostgreSQL evidence, Temporal processing, and advisory GitHub Checks.
The private GitHub App is installed only on `alimobrem/agentci`. Trusted
GitHub-hosted review reads immutable PR data and retains evidence before publishing
Checks; it does not execute PR code with credentials.

| Available in M1 | Later milestones |
| --- | --- |
| Versioned project, requirement, finding and evidence schemas | Behavioral eval execution (M2) |
| Semantic diff for specs, models/config, explicit tools, configured permissions/policies, prompts and dependencies | Runtime tracing and production feedback |
| Deterministic risk with verified versus inferred findings | Model-assisted review and controlled repair |
| Signed webhook ingestion, immutable PR evidence and advisory Checks | Production SaaS and multi-tenant deployment |

[M1 release and downloads](https://github.com/alimobrem/agentci/releases/tag/v0.2.0-m1)
· [Implementation status](specs/implementation-status.md)
· [M1 verification and completion state](docs/releases/m1.md)
· [Deployment and operations](docs/m1-setup.md)

M1 reviews are advisory. A neutral Check reports a completed deterministic review,
not behavioral correctness. Invalid or unsupported input fails explicitly.
The local deployment is for a single repository; production Temporal and hosted
API deployment are later work. See [STATUS.md](STATUS.md) for current milestone
completion and publication status.

## Try the released CLI

Requires **Node.js 26.10.0 (26.x)** and npm. The compiled package needs production
dependencies only; it is downloaded from the GitHub release, not the npm registry.

```sh
mkdir agentci-m1-demo
cd agentci-m1-demo
npm init -y
npm install https://github.com/alimobrem/agentci/releases/download/v0.2.0-m1/agentci-0.2.0-m1.tgz
npx agentci --version
```

Expected version: `0.2.0-m1`. To validate an existing repository containing an
`agentci.yaml` project manifest:

```sh
npx agentci validate --root /path/to/repository --json
```

`agentci init` is not implemented. To try a ready-to-validate project, use the
AgentCI source checkout below. The CLI checks configuration, explicit YAML or
Markdown-front-matter requirements, unique IDs, and eval YAML syntax. It does not
execute evaluations or infer accepted requirements from ordinary prose.

## Develop from source

```sh
git clone https://github.com/alimobrem/agentci.git
cd agentci
npm ci
npm run check
npm run agentci -- validate
```

`npm run check` runs TypeScript checks, deterministic tests, contract evals,
repository validation, and status freshness checks. API integration tests need
loopback access. A successful repository validation reports an inventory count;
that count is not a count of implemented product features.

See the [development guide](docs/development.md) for the M0 API and status
maintenance. M1's separate control API and service packaging are in the
[M1 setup guide](docs/m1-setup.md), with its [OpenAPI contract](specs/api/openapi.json).

## What counts as complete?

A milestone is complete only after its acceptance criteria are met, applicable
checks pass, packages install and run from a clean environment, docs are current,
and the source, tag, release, and required artifacts are published and verified.
A local build or tag is a release candidate. Deployable service milestones also
require published OCI images with tested immutable digests.

The [definition of done](docs/definition-of-done.md) specifies the evidence and
blocking rules. [API correctness](docs/api-quality.md) is a release blocker:
contracts, errors, access controls, retries, and compatibility must be verified.
The [milestone gates](docs/milestone-gates.md) preserve the M0–M10
sequence. Product completion is separate from milestone completion.

## Project references

- [Full product and technical specification](specs/agentci-full-spec.md)
- [Architecture choices](docs/architecture.md), including the Temporal recommendation
- [Trace mapping contract](docs/trace-mapping.md)
- [Current project status](STATUS.md)
- [Release notes](CHANGELOG.md)

License: not yet selected.

Development uses [small tasks and measured feedback loops](docs/delivery-workflow.md).
Run `npm run check:fast` for local feedback and `npm run delivery -- report` for
timings. M1's first live [dogfood Check](docs/dogfood/m1-first-check.md) is verified;
the milestone remains in progress until its release and distribution gates pass.
