import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export function customerActivationInput(mode,descriptor,source){
 if(!/^[a-f0-9]{40}$/.test(source)||descriptor?.schemaVersion!==1||!(/^[a-f0-9]{40}$/.test(descriptor.harnessBase??'')))throw Error('Trusted customer activation source required');
 if(mode==='scope'){
  if(!exact(descriptor,['schemaVersion','purpose','harnessBase','scope'])||descriptor.purpose!=='approved-demo-installation-scope'||!exact(descriptor.scope,['repository','appId','installationId']))throw Error('Bounded customer scope activation required');return {...descriptor.scope,serviceSource:source};
 }
 if(mode!=='demo'||!exact(descriptor,['schemaVersion','purpose','harnessBase','candidate','fixtures'])||descriptor.purpose!=='approved-temporary-four-scenario-demo'||!exact(descriptor.candidate,['releaseSource','packageManifestSha256','packageSha256','imagesManifestSha256','publicationEvidenceSha256'])||!exact(descriptor.fixtures,['repository','appId','installationId','subjects']))throw Error('Bounded customer demo activation required');
 return {...descriptor.candidate,fixtures:{...descriptor.fixtures,serviceSource:source}};
}
export async function requireCustomerActivation(mode,input,environment=process.env){
 if(environment.GITHUB_EVENT_NAME==='workflow_dispatch')return;
 if(environment.GITHUB_EVENT_NAME!=='push'||environment.GITHUB_REPOSITORY!=='alimobrem/agentci'||environment.GITHUB_REF!=='refs/heads/main')throw Error('Trusted customer activation required');
 const path=mode==='scope'?'releases/m3-customer-installation.json':'releases/m3-customer-demo.json',descriptor=JSON.parse(await readFile(path,'utf8'));
 execFileSync('git',['merge-base','--is-ancestor',descriptor.harnessBase,environment.GITHUB_SHA],{env:{PATH:environment.PATH},stdio:'pipe'});
 if(canonical(customerActivationInput(mode,descriptor,environment.GITHUB_SHA))!==canonical(input))throw Error('Customer activation input mismatch');
}
