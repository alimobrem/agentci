# AgentCI

AgentCI is an engineering control plane for AI-generated and agentic software.
It connects specifications, code changes, evaluations, and release evidence so
reviewers can understand what changed and how it was verified.

The first product goal is a GitHub pull-request check that explains changes to
requirements, permissions, tools, models, prompts, and risk. Later milestones add
runtime tracing, production feedback, and controlled repair. Git, existing CI,
OpenTelemetry, and deployment systems remain the integration foundations.

## Current state

**M0 is released. M1 has not started.** AgentCI cannot review PRs yet.

| Available in M0 | Planned next |
| --- | --- |
| Versioned project, requirement, finding, and evidence schemas | Semantic PR diff and deterministic risk rules |
| CLI validation of explicit repository contracts | GitHub App and advisory PR Checks |
| Local API skeleton for schema/document validation | Durable PR-review orchestration |
| Source-linked implementation inventory and contract evals | Stored evidence tied to the exact PR head |

[M0 release and downloads](https://github.com/alimobrem/agentci/releases/tag/v0.1.0-m0)
· [Implementation status](specs/implementation-status.md)
· [Release verification](docs/releases/m0.md)

M0 is a contracts prerelease. Its API is a local development skeleton without
persistence or authentication. Model reviews, behavioral eval execution, OCI
service images, and Temporal integration are not included.

## Try the released CLI

Requires **Node.js >=22.17** and npm. The compiled package needs production
dependencies only; it is downloaded from the GitHub release, not the npm registry.

```sh
mkdir agentci-m0-demo
cd agentci-m0-demo
npm init -y
npm install https://github.com/alimobrem/agentci/releases/download/v0.1.0-m0/agentci-0.1.0-m0.tgz
npx agentci --version
```

Expected version: `0.1.0-m0`. To validate an existing repository containing an
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

See the [development guide](docs/development.md) for API usage, packaging, smoke
tests, and status maintenance.

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
