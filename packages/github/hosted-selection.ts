import type {Octokit} from '@octokit/rest';
/** A trusted workflow supplies the event kind/number. This narrows work, never
 * supplies a commit or authorization: the caller still fetches current PR identity.
 */
export async function hostedReviewCandidates(client:Octokit,repository:string,event:string|undefined,rawNumber:string|undefined):Promise<{number:number}[]>{
 if(repository!=='alimobrem/agentci')throw new Error('invalid-hosted-review-scope');
 if(event==='pull_request_target'){
  if(typeof rawNumber!=='string'||!/^[1-9][0-9]{0,15}$/.test(rawNumber)||!Number.isSafeInteger(Number(rawNumber)))throw new Error('invalid-hosted-review-trigger');
  return [{number:Number(rawNumber)}];
 }
 if(!['push','schedule','workflow_dispatch'].includes(event??'workflow_dispatch')||rawNumber)throw new Error('invalid-hosted-review-trigger');
 const [owner,repo]=repository.split('/') as [string,string];
 const first=await client.pulls.list({owner,repo,state:'open',per_page:100,page:1});
 if(!Array.isArray(first.data)||first.data.length>100)throw new Error('invalid-hosted-review-list');
 if(first.data.length===100){const next=await client.pulls.list({owner,repo,state:'open',per_page:100,page:2});if(!Array.isArray(next.data)||next.data.length)throw new Error('Hosted PR budget exceeded');}
 const numbers=first.data.map(pr=>pr.number);
 if(numbers.some(n=>!Number.isSafeInteger(n)||n<1)||new Set(numbers).size!==numbers.length)throw new Error('invalid-hosted-review-list');
 return numbers.map(number=>({number}));
}
