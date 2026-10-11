import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RUNTIME_FILES,validateRuntimeEvidence} from './lib/download-runtime-evidence.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const identitiesBytes=await readFile('downloaded-identities.json'),identities=JSON.parse(identitiesBytes);
const expected={sourceCommit:process.env.RELEASE_SOURCE,version:process.env.RELEASE_VERSION,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,acceptanceCommit:process.env.ACCEPTANCE_SOURCE,platform:'linux/'+process.env.RELEASE_ARCH,identitiesSha256:hash(identitiesBytes)};
for(const key of ['sourceCommit','version','runId','attempt','platform'])if(identities[key]!==expected[key])throw Error('Downloaded runtime cohort mismatch');
const readJSON=async path=>JSON.parse(await readFile(path));
const pins={native:await readJSON('deploy/security/native-components.json'),forge:await readJSON('deploy/engines/patches/forge-backport.json'),verifierSha256:hash(await readFile('deploy/engines/patches/verify-forge-backport.cjs')),fixtureSha256:hash(await readFile('deploy/engines/patches/forge-nested-digest-fixture.json')),dockerLicenseSha256:hash(await readFile('deploy/licenses/docker-cli-LICENSE'))};
const records={};for(const name of RUNTIME_FILES){const body=await readJSON(name);if(body.acceptance)throw Error('Runtime evidence already bound');records[name]={...body,acceptance:{schemaVersion:1,...expected,file:name,recordSha256:hash(JSON.stringify(body))}};}
validateRuntimeEvidence(records,identities,expected,pins);
for(const name of RUNTIME_FILES)await writeFile(name,JSON.stringify(records[name],null,2)+'\n');
