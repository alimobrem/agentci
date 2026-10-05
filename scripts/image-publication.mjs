import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const IMAGE_ROLES=['api','worker','eval-worker','eval-runner','eval-engines','eval-agentci'];
export async function assertUnusedImageTag(role,version,credentials,request=fetch){
 if(!IMAGE_ROLES.includes(role)||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version))throw new Error('Invalid publication identity');
 if(!credentials.actor||!credentials.token)throw new Error('Scoped publication credentials required');
 const scope=new URL('https://ghcr.io/token');scope.searchParams.set('service','ghcr.io');scope.searchParams.set('scope',`repository:alimobrem/agentci-${role}:pull,push`);
 try{
  const auth=await request(scope,{headers:{authorization:'Basic '+Buffer.from(`${credentials.actor}:${credentials.token}`).toString('base64')},signal:AbortSignal.timeout(15000)});
  if(!auth.ok)throw new Error();const data=await auth.json();if(typeof data.token!=='string'||!data.token)throw new Error();
  const response=await request(`https://ghcr.io/v2/alimobrem/agentci-${role}/manifests/${version}`,{method:'HEAD',headers:{authorization:`Bearer ${data.token}`,accept:'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'},signal:AbortSignal.timeout(15000)});
  if(response.status===200)throw new Error('Version tag already exists; choose a new version');
  if(response.status!==404)throw new Error();
 }catch(error){if(error.message==='Version tag already exists; choose a new version')throw error;throw new Error('Registry availability/authorization is inconclusive; refusing publication');}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const role=process.env.IMAGE_ROLE,version=process.env.CANDIDATE_VERSION;
 const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(!/^[a-f0-9]{40}$/.test(source)||source!==process.env.GITHUB_SHA||JSON.parse(await readFile('package.json','utf8')).version!==version||!IMAGE_ROLES.includes(role))throw new Error('Publication source/version mismatch');
 if(process.argv[2]==='preflight')await assertUnusedImageTag(role,version,{actor:process.env.GITHUB_ACTOR,token:process.env.GITHUB_TOKEN});
 else if(process.argv[2]==='record'){
  const digest=process.env.IMAGE_DIGEST;if(!/^sha256:[a-f0-9]{64}$/.test(digest))throw new Error('Immutable digest required');
  await mkdir('published',{recursive:true});await writeFile(`published/${role}-identity.json`,JSON.stringify({version,sourceCommit:source,role,image:`ghcr.io/alimobrem/agentci-${role}@${digest}`,platforms:['linux/amd64','linux/arm64'],runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT},null,2)+'\n');
 }else throw new Error('Use preflight or record');
}
