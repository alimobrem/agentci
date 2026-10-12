import {mkdir,writeFile} from 'node:fs/promises';
import {cleanupImageSmokeState} from './lib/image-smoke-state.mjs';
let receipt;
try{
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='alimobrem/agentci')throw Error('Owned CI runner required');
 if(!process.env.AGENTCI_IMAGE_SMOKE_STATE_FILE&&process.env.AGENTCI_IMAGE_SMOKE_OUTCOME!=='skipped')throw Error('Unknown smoke startup outcome');
 receipt=process.env.AGENTCI_IMAGE_SMOKE_STATE_FILE?await cleanupImageSmokeState(process.env.AGENTCI_IMAGE_SMOKE_STATE_FILE):{schemaVersion:1,result:'not-started'};
}catch{receipt={schemaVersion:1,result:'recovery-required-or-unverified',privateState:'retain for owned recovery'};process.exitCode=1;}
try{await mkdir('.agentci/artifacts',{recursive:true});await writeFile('.agentci/artifacts/image-smoke-cleanup.json',JSON.stringify(receipt,null,2)+'\n');}catch{process.exitCode=1;}
if(process.exitCode)console.error('Owned image smoke cleanup unverified; credentials withheld');
