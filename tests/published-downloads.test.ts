import test from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error operational ESM tool has no TypeScript declaration
import {validateDownloadedIdentity} from '../scripts/published-downloads.mjs';
test('download acceptance rejects wrong source, version, platform and substituted digest',()=>{
 const source='a'.repeat(40),version='0.3.0-m2',reference='ghcr.io/alimobrem/agentci-eval-runner@sha256:'+'b'.repeat(64);
 const image={Id:'sha256:'+'c'.repeat(64),Os:'linux',Architecture:'arm64',RepoDigests:[reference],Config:{Labels:{'org.opencontainers.image.revision':source,'org.opencontainers.image.version':version,'org.opencontainers.image.source':'https://github.com/alimobrem/agentci'}}};
 assert.equal(validateDownloadedIdentity('eval-runner',reference,source,version,'arm64',image).platform,'linux/arm64');
 for(const changed of [{...image,Architecture:'amd64'},{...image,Os:'windows'},{...image,RepoDigests:[]},{...image,Id:'runner:latest'},{...image,Config:{Labels:{...image.Config.Labels,'org.opencontainers.image.revision':'d'.repeat(40)}}},{...image,Config:{Labels:{...image.Config.Labels,'org.opencontainers.image.version':'old'}}}])assert.throws(()=>validateDownloadedIdentity('eval-runner',reference,source,version,'arm64',changed),/mismatch/);
 assert.throws(()=>validateDownloadedIdentity('api',reference,source,version,'arm64',image),/role digest/);
 assert.throws(()=>validateDownloadedIdentity('eval-runner',reference,source,version,'unsupported',image),/release identity/);
});
