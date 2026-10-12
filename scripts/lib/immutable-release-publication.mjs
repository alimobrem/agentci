import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {parse} from 'yaml';
// Generic callers require push access. Trusted Actions callers use the distinct
// source-bound installation permission contract, never public listing alone.
const actionsVisibility=new WeakMap();
const tokenDigest=token=>createHash('sha256').update(token).digest('hex');
export async function actionsDraftVisibility(environment,{cwd=process.cwd(),command}={}){
 const repository='alimobrem/agentci',job=environment.GITHUB_JOB,source=environment.GITHUB_SHA,path='.github/workflows/development-candidate.yaml';
 if(environment.GITHUB_ACTIONS!=='true'||environment.GITHUB_REPOSITORY!==repository||environment.GITHUB_REF!=='refs/heads/main'||!['push','workflow_dispatch'].includes(environment.GITHUB_EVENT_NAME)||environment.GITHUB_WORKFLOW_REF!==repository+'/'+path+'@refs/heads/main'||environment.GITHUB_WORKFLOW_SHA!==source||!/^[a-f0-9]{40}$/.test(source??'')||!['preflight','release-candidate'].includes(job)||typeof environment.GITHUB_TOKEN!=='string'||!environment.GITHUB_TOKEN)throw Error('Source-bound Actions contents-write context required for draft inventory');
 if(execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim()!==source)throw Error('Actions installation source HEAD mismatch');
 const committed=execFileSync('git',['show',source+':'+path],{cwd});
 if(!(await readFile(join(cwd,path))).equals(committed))throw Error('Actions draft-visibility workflow differs from exact committed source');
 const workflow=parse(committed.toString('utf8')),jobContract=workflow?.jobs?.[job];
 if(jobContract?.permissions?.contents!=='write')throw Error('Committed Actions contents-write grant required');
 const expectedCommand=job==='preflight'?'preflight':'publish',steps=jobContract.steps;
 if(command!==expectedCommand)throw Error('Actions installation job and operation differ');
 const injections=Array.isArray(steps)?steps.filter(step=>step.run==='node scripts/development-release.mjs '+command):[];
 if(injections.length!==1||injections[0].env?.GITHUB_TOKEN!=='${{ secrets.GITHUB_TOKEN }}')throw Error('Exact committed Actions token injection required');
 const visibility=Object.freeze({mode:'trusted-actions-installation',repository,sourceCommit:source,job});
 actionsVisibility.set(visibility,Object.freeze({tokenDigest:tokenDigest(environment.GITHUB_TOKEN),repository,sourceCommit:source,job}));
 return visibility;
}
export async function candidateReleases(github,repository,tag,visibility){
 const access=await github.rest.repos.get(repository),push=access.data.permissions?.push;
 if(visibility!==undefined){
  const bound=visibility&&typeof visibility==='object'?actionsVisibility.get(visibility):null;
  if(!bound||visibility.mode!=='trusted-actions-installation'||visibility.repository!==bound.repository||visibility.sourceCommit!==bound.sourceCommit||visibility.job!==bound.job||bound.repository!==repository.owner+'/'+repository.repo||access.data.full_name!==bound.repository||typeof github.auth!=='function')throw Error('Authenticated Actions installation visibility required for draft inventory');
  const authentication=await github.auth();
  if(authentication?.type!=='token'||authentication.tokenType!=='installation'||typeof authentication.token!=='string'||tokenDigest(authentication.token)!==bound.tokenDigest)throw Error('Actions installation authentication differs from committed token injection');
  // User-style push metadata is diagnostic only in this separately validated mode.
 }else if(push!==true)throw Error('Authenticated push visibility required for draft inventory');
 const matches=[];const ids=new Set();
 for(let page=1;page<=1000;page++){
  const response=await github.rest.repos.listReleases({...repository,per_page:100,page});const releases=response.data;
  if(!Array.isArray(releases)||releases.length>100||releases.some(r=>!Number.isSafeInteger(r.id)||r.id<=0||typeof r.tag_name!=='string'))throw Error('Release listing ambiguity');
  for(const release of releases){if(ids.has(release.id))throw Error('Release pagination repeated an identity');ids.add(release.id);if(release.tag_name===tag)matches.push(release);}
  const link=response.headers?.link;if(link!==undefined&&typeof link!=='string')throw Error('Release pagination link ambiguity');
  const next=(link??'').split(',').filter(part=>/;\s*rel=["']?next["']?(?:\s|$)/.test(part.trim()));
  if(next.length>1)throw Error('Multiple next release pages');
  if(next.length){const target=next[0].match(/<([^>]+)>/);if(!target)throw Error('Invalid next release page');const url=new URL(target[1]);if(url.protocol!=='https:'||url.hostname!=='api.github.com'||url.port||url.username||url.password||url.pathname!==`/repos/${repository.owner}/${repository.repo}/releases`||url.searchParams.get('page')!==String(page+1)||url.searchParams.get('per_page')!=='100'||[...url.searchParams.keys()].some(key=>!['page','per_page'].includes(key)))throw Error('Unexpected release pagination scope');}
  if(!next.length&&releases.length<100)return matches;
 }
 throw Error('Release pagination incomplete');
}
export async function requireCandidateReleaseAbsent(github,repository,tag,visibility){if((await candidateReleases(github,repository,tag,visibility)).length)throw Error('Candidate occupied by published release or draft');}
export function requireReleaseAssets(remote,assets){if(remote.length!==assets.length||!assets.every(a=>remote.filter(r=>r.name===a.name&&r.state==='uploaded'&&r.size===a.bytes.length&&r.digest==='sha256:'+a.sha256).length===1))throw Error('Release asset inventory mismatch');}
// Reconcile only this exact source/run draft intent; never overwrite occupied identities.
export async function publishDraftAssets(github,repository,intent,assets,onState,visibility){
 const readTag=async()=>{try{const object=(await github.rest.git.getRef({...repository,ref:'tags/'+intent.tag})).data?.object;if(!object||!['commit','tag'].includes(object.type)||!/^[a-f0-9]{40}$/.test(object.sha??''))throw Error('Ambiguous Git ref response');return object;}catch(error){if(error.status===404)return null;throw error;}};
 const requireTagAbsent=async phase=>{const actual=await readTag();if(actual)throw Error('Occupied Git tag during '+phase);await onState({tagAbsence:{phase,result:'absent'}});};
 let ownedId;const owned=release=>{if(release.tag_name!==intent.tag||release.target_commitish!==intent.sourceCommit||release.body!==intent.body||!release.prerelease||(!Number.isSafeInteger(release.id)||release.id<=0)||ownedId!==undefined&&release.id!==ownedId)throw Error('Release intent identity mismatch');ownedId=release.id;return release;};
 await requireCandidateReleaseAbsent(github,repository,intent.tag,visibility);
 await requireTagAbsent('before-create');
 let release;try{release=owned((await github.rest.repos.createRelease({...repository,tag_name:intent.tag,target_commitish:intent.sourceCommit,name:intent.name,body:intent.body,prerelease:true,draft:true,make_latest:'false'})).data);}catch(error){try{const candidates=await candidateReleases(github,repository,intent.tag,visibility);if(candidates.length!==1||candidates[0].draft!==true)throw Error('Ambiguous draft creation outcome');release=owned(candidates[0]);await onState({reconciliation:{phase:'create',releaseId:release.id,status:error.status??null,result:'exact owned draft retained'}});}catch{throw error;}}
 if(!release.draft)throw Error('Created release is already published; do not upload');
 await onState({releaseId:release.id,publicationState:'draft'});
 // GitHub draft creation does not supply an owned tag-creation receipt. A tag visible now is occupied, even at the desired SHA.
 await requireTagAbsent('before-upload');
 const inventory=async()=>{const result=await github.rest.repos.listReleaseAssets({...repository,release_id:release.id,per_page:100});if(result.data.length>assets.length||new Set(result.data.map(a=>a.name)).size!==result.data.length||result.data.some(r=>!assets.some(a=>r.name===a.name&&r.state==='uploaded'&&r.size===a.bytes.length&&r.digest==='sha256:'+a.sha256)))throw Error('Unexpected occupied draft assets');return result.data;};
 const matches=(remote,asset)=>remote.name===asset.name&&remote.state==='uploaded'&&remote.size===asset.bytes.length&&remote.digest==='sha256:'+asset.sha256;
 for(const asset of assets){const before=await inventory(),existing=before.filter(a=>a.name===asset.name);if(existing.length>1||existing.length===1&&!matches(existing[0],asset))throw Error('Occupied asset identity mismatch');
  if(!existing.length){try{await github.rest.repos.uploadReleaseAsset({...repository,release_id:release.id,name:asset.name,headers:{'content-type':'application/octet-stream','content-length':asset.bytes.length},data:asset.bytes});}catch(error){const reconciled=(await inventory()).filter(a=>a.name===asset.name);if(reconciled.length!==1||!matches(reconciled[0],asset))throw error;await onState({reconciliation:{phase:'upload',releaseId:release.id,asset:asset.name,sha256:asset.sha256,status:error.status??null,result:'exact asset retained'}});}}
  const verified=(await inventory()).filter(a=>a.name===asset.name);if(verified.length!==1||!matches(verified[0],asset))throw Error('Uploaded draft asset digest mismatch');await onState({asset:{name:asset.name,sha256:asset.sha256}});
 }
 const complete=await inventory();if(complete.length!==assets.length||!assets.every(a=>complete.filter(r=>matches(r,a)).length===1))throw Error('Draft asset inventory incomplete');
 owned((await github.rest.repos.getRelease({...repository,release_id:release.id})).data);
 await requireTagAbsent('before-publish');
 let published;try{published=(await github.rest.repos.updateRelease({...repository,release_id:release.id,draft:false})).data;}catch(error){try{published=(await github.rest.repos.getRelease({...repository,release_id:release.id})).data;await onState({reconciliation:{phase:'publish',releaseId:release.id,status:error.status??null,result:'release state read; tag binding still required'}});}catch{throw error;}}
 owned(published);if(published.draft!==false)throw Error('Publication remains ambiguous/draft');
 await onState({publicationState:'published-unverified'});
 const actualTag=await readTag();if(!actualTag||actualTag.type!=='commit'||actualTag.sha!==intent.sourceCommit)throw Error('Actual published Git tag source mismatch');
 await onState({publishedTag:{type:actualTag.type,sha:actualTag.sha}});
 const retained=await inventory();if(retained.length!==assets.length||!assets.every(a=>retained.filter(r=>matches(r,a)).length===1))throw Error('Published asset inventory mismatch');
 await onState({publicationState:'published'});return release.id;
}
export function requireRetainedArtifact(artifact,expected){
 if(artifact.id!==expected.id||artifact.name!==expected.name||artifact.expired!==false||artifact.digest!==expected.digest||!Number.isSafeInteger(artifact.size_in_bytes)||artifact.size_in_bytes<=0||artifact.workflow_run?.id!==Number(expected.runId)||artifact.workflow_run?.head_sha!==expected.sourceCommit||!artifact.expires_at||!Number.isFinite(Date.parse(artifact.expires_at))||Date.parse(artifact.expires_at)<=Date.now()||!/^sha256:[a-f0-9]{64}$/.test(expected.digest))throw Error('Retained evidence artifact identity mismatch');
 return {id:artifact.id,name:artifact.name,digest:artifact.digest,runId:expected.runId,attempt:expected.attempt,sourceCommit:expected.sourceCommit,expiresAt:artifact.expires_at,access:'authenticated Actions artifact; not permanent anonymous evidence'};
}
