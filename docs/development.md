# Development and verification

Run commands from the source checkout. Node.js >=22.17 and npm are required.

## Local API

```sh
npm ci
npm run api
```

The API binds to `127.0.0.1:3000`; `AGENTCI_PORT` changes the port. Stop it with
Ctrl-C. It stores nothing and is a development skeleton.

| Route | Behavior |
| --- | --- |
| GET /healthz | Version and milestone metadata |
| GET /v1/schemas/agent-project | Project JSON Schema |
| GET /v1/schemas/requirement | Requirement JSON Schema |
| GET /v1/schemas/finding | Finding JSON Schema |
| GET /v1/schemas/evidence | Evidence JSON Schema |
| POST /v1/validate | Validate a document against a named schema |

```sh
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/v1/validate \
  -H 'Content-Type: application/json' \
  -d '{"schema":"requirement","document":{"id":"DEMO-1","title":"Example","type":"functional","status":"active","text":"An explicit requirement."}}'
```

Document validation returns 200 for valid input, 422 for invalid contracts, 400
for malformed requests, 415 for unsupported content types, and 413 above 1 MiB.
Other product resources are not implemented.

## Verification and packaging

To reproduce M0, run these commands in a clean checkout of `v0.1.0-m0`.
When packaging changed source or package contents, assign a new version first
and use that version's archive name in the smoke command.

```sh
npm run check
npm run build
mkdir -p releases
npm pack --pack-destination releases
node scripts/package-smoke.mjs releases/agentci-0.1.0-m0.tgz
```

The smoke test uses npm's offline cache. It performs a clean production-only
installation and checks the executable version, valid input, and invalid-input
exit code. It fails if dependencies are not cached. Ordinary installation may
fetch production dependencies from npm.

Build output includes compiled JavaScript, TypeScript declarations and JSON Schema
assets. The CLI works without tsx/TypeScript in the installed production package.
Do not replace a published version's artifact; changes need a new version.
See the [definition of done](definition-of-done.md) for full release gates,
including downloading published artifacts and comparing their checksums.

## Contract boundaries

CLI exits: 0 valid, 1 invalid input, 2 unsupported invocation/infrastructure failure.
Validation reads data only and does not execute repository code or eval commands.
M0 parses eval YAML but does not validate a future M2 structured eval contract.
Full commit IDs and SHA-256 digests are required where the schemas specify them;
abbreviated identifiers in product-spec examples are illustrative.

Schema validity does not prove a finding, enforce blocking policy or tenant
isolation, persist immutable evidence, or verify referenced artifact contents.

## Implementation status

Edit `specs/requirements.yaml`, attach code/test evidence, then run:

```sh
npm run status
npm run status -- --check
```

Keep existing trace IDs stable. Draft inventory entries conservatively include
explanatory prose; they do not make all prose normative. Mark only the scope
actually implemented/tested. Schema work does not complete a future feature that
uses that schema. Keep source-line references consistent when the spec changes.
