# Installed v2 finding-history reader acceptance

M3-07c-3d-1b tests the supported `agentci/client` export from the compiled build
and an actual production-only package installation. It does not activate a
reproduction route, worker or consumer, and is not a full milestone release demo.

The fixture retains an admitted finding in real PostgreSQL, queues an approved
reproduction and durably cancels it before staging. The trusted controller stores
a distinct non-execution proof and a v1alpha2 unavailable history event. Execution
receipts, evaluator jobs/units and legacy review rows remain absent. An actual
control HTTP server is created without a reviewer runtime, provider credentials,
GitHub client or Temporal connection.

The public client verifies current v2 finding and three one-record pages spanning
v1alpha1 creation/queue and v1alpha2 unavailable. It also reads the original pinned
v1 record. Unauthorized and wrong-scope requests fail. Outbound fault injection
after genuine database reads substitutes a proof subject or an unknown future
version; the installed client rejects both, including mid-pagination, without
certifying a complete traversal. The positive path uses unmodified retained data.

## Repeat locally

Set `AGENTCI_TEST_DATABASE_URL`, `PGUSER` and `PGPASSWORD` for a disposable test
PostgreSQL service whose role can create/drop fixture-owned schemas. No Temporal
address, provider credentials or runner image is required for this read fixture.

```sh
npm run build
node --import tsx --test tests/integration/reproduction-installed-reader.test.ts
mkdir -p releases
npm pack --pack-destination releases
node scripts/package-smoke.mjs --offline --postgres-readers
```

`--offline` requires an already populated npm cache; omit that flag only when a
network dependency installation is intended. `--postgres-readers` fails explicitly
when database configuration is missing. Default manual package smoke keeps its
existing behavior. Verify CI enables this option with its disposable database.
All existing packaged CLI, legacy client/comparison/export checks remain in place.

To exercise an independently installed production package, set
`AGENTCI_TEST_CLIENT_PACKAGE_ROOT` to its `node_modules/agentci` directory and run
the test command above. The probe runs in that consumer's package context and
asserts resolution to its public compiled export after filesystem realpath
normalization; it cannot fall back to a source client import. Server and fixture
helpers remain test-repository code, so this is installed-client acceptance, not
an installed-server deployment claim.
