# Provider live smoke (M3 development)

This command makes paid OpenAI, Anthropic or xAI requests. Run it only with the owner's explicit
spend authorization and dedicated private credential files. It is not enabled by
preflight or by importing a model profile.

Build with `npm run build`, then invoke:

```sh
node dist/cmd/provider-smoke/main.js --config /absolute/private/smoke.json
```

Create the config outside the repository, mode 0600. Its exact JSON shape is:

```json
{
  "authorized": false,
  "provider": "openai",
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

## Prepare private files without making requests

Use a new private directory outside the checkout. This creates disabled configs
and empty credential files only; it does not contact a provider or a database.
The $5 / $35 / $10 ceilings below are proposed acceptance limits, not authorization.
Keep the generated budget IDs for this acceptance campaign rather than running
this again to obtain fresh spend scopes.

```sh
node --input-type=module - /absolute/private/agentci-smoke <<'JS'
import {mkdir,writeFile} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const directory=process.argv[2];
if(!directory||!isAbsolute(directory))throw Error('Use an absolute private directory');
// Refuse an existing directory, preserving any earlier budget IDs and credentials.
await mkdir(directory,{mode:0o700});
const organizationId=randomUUID(); // Dedicated acceptance scope, shared by these configs.
await writeFile(join(directory,'database-url'),'',{mode:0o600,flag:'wx'});
for(const [provider,limitUsdMicros] of [['openai',5000000],['anthropic',35000000],['xai',10000000]]){
  const credentialFile=join(directory,`${provider}-key`);
  await writeFile(credentialFile,'',{mode:0o600,flag:'wx'});
  const config={authorized:false,provider,credentialFile,databaseUrlFile:join(directory,'database-url'),
    budget:{id:randomUUID(),organizationId,repository:'alimobrem/agentci',limitUsdMicros}};
  await writeFile(join(directory,`${provider}.json`),JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
}
JS
```

Fill each key file using a local editor, and put the acceptance database connection
URL in `database-url`. Use provider accounts with access to the selected models.
The database must already have the budget migration above. Keep files mode 0600;
never paste their contents into chat. After approving the provider-specific spending
ceilings, change `authorized` to true in the corresponding configs and share only
their absolute paths. Approval of one provider does not authorize the others.

Run the earlier smoke command once per approved config. If a run fails, retain its
budget ID and database records; diagnose the failure before retrying. A new config
or database is not a way to reset an exhausted authorization.

The required `provider` selects `openai` (reviewed Luna profile) or `anthropic`
(reviewed Opus profile), or `xai` (reviewed Grok profile). Earlier development configs without this field must add
it; the command does not infer a destination from a credential. Each uses its fixed
official origin and Standard service. It runs three requests sequentially (structured output, streaming, then a tool proposal),
with one attempt and a 60-second deadline each. Each reserves its conservative
upper charge before dispatch; unknown costs remain held. Failure stops execution.
A completed request with unknown dollar cost does not free its reservation.

For Anthropic, point `credentialFile` at the dedicated Anthropic key and set an
explicitly authorized budget. Anthropic also sends a fourth request with a constant
synthetic tool result, preserving signed continuation and checking the final answer.
No tool is executed. The four 1,024-output-token requests conservatively
reserve $32.081920 total using full-context upper input pricing. That is a budget
reservation, not an expected bill; the $1 example above is insufficient and will
fail before dispatch. Do not increase the ceiling without spend authorization.

xAI also runs four scenarios using a dedicated xAI credential. Its Grok profile
reserves $2.012288 per 1,024-output-token request, or $8.049152 if all four costs stay
unknown. Valid reported costs settle the reservation after each request. Reservations
use the full context and long-context pricing; they are not predicted charges.

Reported input/output token usage is required for acceptance; missing usage fails
the smoke after accounting, without releasing an unknown charge.

Success prints sanitized identity, usage and duration records. Failure exits 1
with a stable code; invalid private configuration exits 2. SIGINT/SIGTERM cancel
in-flight model execution. Database accounting is awaited. Previously successful
attempts and ambiguous failures remain in the database even if the command fails
before printing a final report. Preserve those records when investigating failures.

A successful run proves only the selected live scenarios (three OpenAI, four Anthropic or xAI).
Tool proposals are validated and never executed.
Provider outage cases, full review integration and released-build acceptance have separate
M3 gates. Synthetic tests never substitute for live provider evidence.
