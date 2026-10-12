export function requireReleaseAssets(remote,assets){if(remote.length!==assets.length||!assets.every(a=>remote.filter(r=>r.name===a.name&&r.state==='uploaded'&&r.size===a.bytes.length&&r.digest==='sha256:'+a.sha256).length===1))throw Error('Release asset inventory mismatch');}
// Reconcile only this exact source/run draft intent; never overwrite occupied identities.
export async function publishDraftAssets(github,repository,intent,assets,onState){
 let ownedId;const owned=release=>{if(release.tag_name!==intent.tag||release.target_commitish!==intent.sourceCommit||release.body!==intent.body||!release.prerelease||(!Number.isSafeInteger(release.id)||release.id<=0)||ownedId!==undefined&&release.id!==ownedId)throw Error('Release intent identity mismatch');ownedId=release.id;return release;};
 let release;try{release=owned((await github.rest.repos.createRelease({...repository,tag_name:intent.tag,target_commitish:intent.sourceCommit,name:intent.name,body:intent.body,prerelease:true,draft:true,make_latest:'false'})).data);}catch(error){try{release=owned((await github.rest.repos.getReleaseByTag({...repository,tag:intent.tag})).data);}catch{throw error;}}
 if(!release.draft)throw Error('Created release is already published; do not upload');
 await onState({releaseId:release.id,publicationState:'draft'});
 const inventory=async()=>{const result=await github.rest.repos.listReleaseAssets({...repository,release_id:release.id,per_page:100});if(result.data.length>assets.length||new Set(result.data.map(a=>a.name)).size!==result.data.length||result.data.some(r=>!assets.some(a=>r.name===a.name&&r.state==='uploaded'&&r.size===a.bytes.length&&r.digest==='sha256:'+a.sha256)))throw Error('Unexpected occupied draft assets');return result.data;};
 const matches=(remote,asset)=>remote.name===asset.name&&remote.state==='uploaded'&&remote.size===asset.bytes.length&&remote.digest==='sha256:'+asset.sha256;
 for(const asset of assets){const before=await inventory(),existing=before.filter(a=>a.name===asset.name);if(existing.length>1||existing.length===1&&!matches(existing[0],asset))throw Error('Occupied asset identity mismatch');
  if(!existing.length){try{await github.rest.repos.uploadReleaseAsset({...repository,release_id:release.id,name:asset.name,headers:{'content-type':'application/octet-stream','content-length':asset.bytes.length},data:asset.bytes});}catch(error){const reconciled=(await inventory()).filter(a=>a.name===asset.name);if(reconciled.length!==1||!matches(reconciled[0],asset))throw error;}}
  const verified=(await inventory()).filter(a=>a.name===asset.name);if(verified.length!==1||!matches(verified[0],asset))throw Error('Uploaded draft asset digest mismatch');await onState({asset:{name:asset.name,sha256:asset.sha256}});
 }
 const complete=await inventory();if(complete.length!==assets.length||!assets.every(a=>complete.filter(r=>matches(r,a)).length===1))throw Error('Draft asset inventory incomplete');
 owned((await github.rest.repos.getRelease({...repository,release_id:release.id})).data);
 let published;try{published=(await github.rest.repos.updateRelease({...repository,release_id:release.id,draft:false})).data;}catch(error){try{published=(await github.rest.repos.getRelease({...repository,release_id:release.id})).data;}catch{throw error;}}
 owned(published);if(published.draft!==false)throw Error('Publication remains ambiguous/draft');
 const retained=await inventory();if(retained.length!==assets.length||!assets.every(a=>retained.filter(r=>matches(r,a)).length===1))throw Error('Published asset inventory mismatch');
 await onState({publicationState:'published'});return release.id;
}
export function requireRetainedArtifact(artifact,expected){
 if(artifact.id!==expected.id||artifact.name!==expected.name||artifact.expired!==false||artifact.digest!==expected.digest||!Number.isSafeInteger(artifact.size_in_bytes)||artifact.size_in_bytes<=0||artifact.workflow_run?.id!==Number(expected.runId)||artifact.workflow_run?.head_sha!==expected.sourceCommit||!artifact.expires_at||!Number.isFinite(Date.parse(artifact.expires_at))||Date.parse(artifact.expires_at)<=Date.now()||!/^sha256:[a-f0-9]{64}$/.test(expected.digest))throw Error('Retained evidence artifact identity mismatch');
 return {id:artifact.id,name:artifact.name,digest:artifact.digest,runId:expected.runId,attempt:expected.attempt,sourceCommit:expected.sourceCommit,expiresAt:artifact.expires_at,access:'authenticated Actions artifact; not permanent anonymous evidence'};
}
