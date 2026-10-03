# AgentCI

M0: repository contracts, CLI validation and local API skeleton.
Primary spec: [specs/agentci-full-spec.md](specs/agentci-full-spec.md).
Live status: [specs/implementation-status.md](specs/implementation-status.md).

Requires Node.js >=22.17 and npm. From the repository root:

```sh
npm ci
npm run check
npm run agentci -- validate
npm run agentci -- validate --root /path/to/project --json
npm run api
```

Install the local M0 release with
`npm install /absolute/path/to/releases/agentci-0.1.0-m0.tgz`, then run
`npx agentci --version` or `npx agentci validate --root /path/to/project`.
The archive contains compiled JavaScript and needs only production dependencies.
To rebuild and smoke-test the package:

```sh
npm pack --pack-destination releases
node scripts/package-smoke.mjs releases/agentci-0.1.0-m0.tgz
```

The smoke test uses npm's offline cache and fails if required production packages
are not cached. The ordinary installation command may fetch them from npm.

The API binds to `127.0.0.1:3000`; set `AGENTCI_PORT` to change it. Routes:
`GET /healthz`, `GET /v1/schemas/{agent-project,requirement,finding,evidence}`,
`POST /v1/validate` with JSON `{ "schema": "requirement", "document": {...} }`.
Valid documents return 200; invalid contracts 422; malformed requests 400;
unsupported content types 415; bodies above 1 MiB 413. Nothing is persisted.

CLI validation checks the project schema, explicit YAML requirements or Markdown
front matter, unique IDs, and eval YAML syntax. It reads data only. Ordinary prose
is not inferred into accepted requirements. Future eval-schema validation and
execution begin in M2. Full commit IDs/digests are required where schemas specify
them; abbreviated identifiers in spec examples are illustrative.

CLI exit codes: 0 valid, 1 invalid input, 2 unsupported invocation/infrastructure
failure. Future commands fail explicitly. Schema validity does not prove findings,
enforce blocking policy or tenancy, persist immutable evidence, or verify digests.

Update `specs/requirements.yaml`, add code/test evidence, then run `npm run status`.
`npm run status -- --check` detects a stale Markdown view. Draft inventory entries
include explanatory prose to avoid gaps; explicit M0 work items are active. Keep
existing IDs stable when refining requirements. See [architecture](docs/architecture.md)
and [trace mapping](docs/trace-mapping.md).

Next: M1 semantic PR review, GitHub App, deterministic diff/risk, evidence and
advisory Checks. AgentCI cannot review its own PRs yet.
