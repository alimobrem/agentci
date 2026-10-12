import {createHash} from 'node:crypto';
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const digest=value=>'sha256:'+createHash('sha256').update(canonical(value)).digest('hex');
const fail=()=>{throw Error('Customer observation is incomplete or does not match the retained exact subject');};
export function requireCustomerServiceOrigin(actual,expected){
 const url=new URL(expected);if(!expected||actual!==expected||url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||!url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Trusted temporary customer service origin required');return expected;
}
/** Real public-client reads only. Physical trial/cleanup observations must be retained separately. */
export async function observeCustomerReview(client,github,{admission,appId,scenario,reproduction}){
 if(admission?.subject?.repository!=='alimobrem/agentci-onboarding-demo'||admission.mode!=='synthetic'||!['seeded-defect','unsupported-claim','fixed-result','failure-restart-recovery'].includes(scenario))fail();
 const status=await client.show(admission);if(canonical(status.admission.request)!==canonical(admission)||!['completed','failed','cancelled','terminated','timed-out'].includes(status.execution.state)||scenario!=='failure-restart-recovery'&&(!status.summary||status.execution.state!=='completed'))fail();
 const records=[];let completion=null,endSeen=false;
 for await(const item of client.modelReviewExport(admission)){
  if(completion)fail();if(item.type==='record'){if(endSeen)fail();records.push(item.frame);if(item.frame.type==='end')endSeen=true;}
  else if(item.type==='complete'){if(!endSeen||item.data.complete!==true)fail();completion=item.data;}else fail();
 }
 if(!completion||!records.length||completion.endDigest!==records.at(-1).digest||canonical(completion.header.review.admission.request)!==canonical(admission))fail();
 const findings=status.summary?await client.findings(admission):{items:completion.header.findings};
 const histories=[];
 for(const finding of findings.items){const pages=[];for await(const page of client.findingHistory(admission,finding.id))pages.push(page);if(!pages.length||pages.at(-1).nextCursor!==null)fail();histories.push({findingId:finding.id,pages});}
 let reproductionStatus=null;
 if(scenario==='unsupported-claim'){if(reproduction||!findings.items.length)fail();if(histories.some(history=>history.pages.some(page=>page.items.some(record=>record.event.receipt!==null||record.event.finding.state==='confirmed'))))fail();}
 else{
  if(!reproduction)fail();reproductionStatus=await client.reproductionStatus(admission,reproduction);
  const settled=reproductionStatus.settlement;if(reproductionStatus.dispatch.state!=='settled'||!settled)fail();
  const history=histories.find(value=>value.findingId===reproduction.finding.id);if(!history)fail();
  const record=history.pages.flatMap(page=>page.items).find(value=>value.event.finding.version===settled.findingVersion);
  if(!record||record.digest!==settled.historyDigest)fail();
  if(scenario==='seeded-defect'||scenario==='fixed-result'){
   const receipt=reproductionStatus.receipt;if(!receipt||reproductionStatus.nonExecution||settled.kind!=='receipt-retained'||receipt.value.actor!=='reproduction'||!/^sha256:[a-f0-9]{64}$/.test(receipt.value.assertionDigest??'')||receipt.value.outcome!==(scenario==='seeded-defect'?'reproduced':'not-reproduced')||canonical(record.event.receipt)!==canonical(receipt.value)||settled.evidenceDigest!==digest(receipt.value))fail();
  }else if(settled.kind==='never-staged'){
   if(reproductionStatus.receipt||!reproductionStatus.nonExecution||record.event.receipt!==null||canonical(record.event.nonExecution)!==canonical(reproductionStatus.nonExecution.value)||settled.evidenceDigest!==digest(reproductionStatus.nonExecution.value))fail();
  }else if(!reproductionStatus.receipt||reproductionStatus.nonExecution||settled.kind!=='receipt-retained'||reproductionStatus.receipt.value.actor!=='reproduction'||canonical(record.event.receipt)!==canonical(reproductionStatus.receipt.value)||settled.evidenceDigest!==digest(reproductionStatus.receipt.value))fail();
 }
 const {data}=await github.request('GET /repos/{owner}/{repo}/commits/{ref}/check-runs',{owner:'alimobrem',repo:'agentci-onboarding-demo',ref:admission.subject.headSha,per_page:100});
 if(data.total_count>100)fail();
 const externalId=`agentci:model-review:${admission.subject.pullRequest}:${admission.subject.baseSha}:${admission.subject.headSha}:${admission.id}`;
 const matches=data.check_runs.filter(run=>run.name==='agentci/model-review'&&run.external_id===externalId&&run.head_sha===admission.subject.headSha&&run.app?.id===appId);
 if(matches.length!==1||matches[0].status!=='completed'||!['neutral','action_required'].includes(matches[0].conclusion))fail();
 return {schemaVersion:1,scenario,admission,status,findings,histories,export:{records,completion},reproductionStatus,check:{id:matches[0].id,appId,headSha:matches[0].head_sha,externalId,conclusion:matches[0].conclusion,url:matches[0].html_url},physicalTrialAndCleanup:'requires-separate-trusted-operator-observations',customerEndpointAcceptance:'unverified'};
}
