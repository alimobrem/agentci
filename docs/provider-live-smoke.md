# Provider live smoke (M3 development)

This command makes paid OpenAI requests. Run it only with the owner's explicit
spend authorization and dedicated private credential files. It is not enabled by
preflight or by importing a model profile. Anthropic/xAI live commands remain pending.

Build with `npm run build`, then invoke:

```sh
node dist/cmd/provider-smoke/main.js --config /absolute/private/smoke.json
```

Create the config outside the repository, mode 0600. Its exact JSON shape is:

```json
{
  "authorized": false,
  "credentialFile": "/absolute/private/openai-key",
  "databaseUrlFile": "/absolute/private/database-url",
  "budget": {
    "id": "11111111-1111-4111-8111-111111111111",
    "organizationId": "22222222-2222-4222-8222-222222222222",
    "repository": "alimobrem/agentci",
    "limitUsdMicros": 1000000
  }
}
```

Replace the example UUIDs with the actual acceptance budget and organization IDs.
Set the authorized ceiling (USD 1 = 1,000,000 microdollars), then set `authorized`
to true only after authorization. Keep the same budget ID across retries, restarts
and concurrent commands. Creating a new budget ID creates another spend scope;
never do that to bypass an exhausted authorization. The database must retain the
budget tables and have migrations through `004_m3_model_budget.sql` applied.
The command does not migrate, reset or provision a database.

The key file contains only the API key; the database file contains only the
PostgreSQL connection URL. Both must be private regular files, at most 64 KiB,
without symlinks. Do not put secrets in shell arguments or repository files.

The command uses the reviewed Luna profile, Standard service and fixed OpenAI
origin. It runs three requests sequentially (structured output, streaming, then a tool proposal),
with one attempt and a 60-second deadline each. Each reserves its conservative
upper charge before dispatch; unknown costs remain held. Failure stops execution.
A completed request with unknown dollar cost does not free its reservation.

Reported input/output token usage is required for acceptance; missing usage fails
the smoke after accounting, without releasing an unknown charge.

Success prints sanitized identity, usage and duration records. Failure exits 1
with a stable code; invalid private configuration exits 2. SIGINT/SIGTERM cancel
in-flight model execution. Database accounting is awaited. Previously successful
attempts and ambiguous failures remain in the database even if the command fails
before printing a final report. Preserve those records when investigating failures.

A successful run proves only these three live scenarios. Tool proposals are validated and never executed.
Provider outage cases, full review integration and released-build acceptance have separate
M3 gates. Synthetic tests never substitute for live provider evidence.
