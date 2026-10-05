import type {Octokit} from '@octokit/rest';
import {githubFailureDiagnostic} from './failure-diagnostics.ts';

export class GitHubRateLimitWait extends Error {
 readonly status=429;
 readonly response:{headers:Record<string,string>};
 constructor(readonly retryAt:number,now:number){
  super('github-rate-limit-wait');
  this.response={headers:{'retry-after':String(Math.max(1,Math.ceil((retryAt-now)/1000))),'x-ratelimit-reset':String(Math.ceil(retryAt/1000))}};
 }
}
/** Installation-client scoped cooldown. It does not sleep, retry, or change
 * permissions. Already dispatched requests cannot be recalled. A fresh process
 * has no shared cooldown state; hosted scheduling must also respect reset times.
 */
export function guardGitHubRateLimits(client:Octokit,now:()=>number=Date.now){
 let retryAt=0;
 client.hook.before('request',()=>{const time=now();if(time<retryAt)throw new GitHubRateLimitWait(retryAt,time);});
 client.hook.error('request',async error=>{
  // A local rejection must not extend the deadline on every activity retry.
  if(error instanceof GitHubRateLimitWait)throw error;
  const data=githubFailureDiagnostic(error),time=now();
  if((data.status===403||data.status===429)&&(data.remaining===0||data.retryAfterSeconds!==null||data.status===429)){
   const deadlines:number[]=[];
   if(data.remaining===0&&data.resetEpochSeconds!==null&&data.resetEpochSeconds*1000>time)deadlines.push(data.resetEpochSeconds*1000);
   if(data.retryAfterSeconds!==null&&data.retryAfterSeconds>0)deadlines.push(time+data.retryAfterSeconds*1000);
   // Without actionable timing, GitHub recommends waiting at least a minute.
   const deadline=deadlines.length?Math.max(...deadlines):time+60000;
   if(Number.isSafeInteger(deadline))retryAt=Math.max(retryAt,deadline);
  }
  throw error;
 });
}
