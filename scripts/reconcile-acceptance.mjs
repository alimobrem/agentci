// Snapshot the audit links; never promote an implementation or verification result.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parse} from 'yaml';
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const inventory=parse(fs.readFileSync('specs/requirements.yaml','utf8')).requirements;
const tasks=JSON.parse(fs.readFileSync('delivery/tasks.json')).tasks;
const phasePlan=JSON.parse(fs.readFileSync('delivery/phase-pr-plan.json'));
const plan=phasePlan.phases;
const apiFiles=fs.readdirSync('specs/api').filter(p=>p.endsWith('operations.json')).map(p=>'specs/api/'+p);
const operations=apiFiles.flatMap(p=>{const d=JSON.parse(fs.readFileSync(p));return(d.operations??[]).map(op=>({...op,map:p,mapDigest:digest(p)}));});
const root='delivery/reconciliation/';
const overrides={};
const own=(id,first,later=[],note='Source-preserving staged mapping; no completion claim')=>overrides[id]={firstImplementation:first,laterValidation:later,note};
for(let n=6;n<=26;n++){
 const phase=n<=10?'M2':n<=13?'M3':n<=16?'M4':n<=18?'M6':n<=22?'M7':n===23?'M8':n<=25?'M9':'M10';
 own(`SPEC-44-${String(n).padStart(3,'0')}`,phase,n===17?['M7','M8','M9','M10']:[]);
}
for(let n=2;n<=23;n++){
 const phase=n<=9?'M1':n<=11?'M2':n<=13?'M3':n===14?'M3':n<=18?'M10':n>=20?'M7':'M7';
 own(`SPEC-48-${String(n).padStart(3,'0')}`,phase,[],n===14?'Blocking check demo needs separately approved measured D3 policy; no automatic enforcement':'Phase demo obligation, retain original end-to-end scenario');
}
for(let n=2;n<=12;n++)own(`SPEC-33.1-${String(n).padStart(3,'0')}`,'M3',['M4','M6','M8','M9','M10'],'Approved M3 initial PR dashboard; later views implemented with their domain boundaries');
own('SPEC-19.2-008','M7',['M9'],'Replay task contract/catalog in M7; actual replay execution/installed acceptance in M9 remains an explicit sequencing reconciliation for approval');
own('SPEC-44-017','M1',['M2','M3','M4','M5','M6','M7','M8','M9','M10'],'Every check result lineage starts with M1; validate through every later boundary');
const ref=p=>({path:p,sha256:fs.existsSync(p)?digest(p):null,availability:fs.existsSync(p)?'present':'missing',meaning:'Source/test/record reference; presence is not execution acceptance'});
const rows=inventory.map(r=>{
 const related=tasks.filter(t=>t.requirementIds.includes(r.id));
 const ops=operations.filter(op=>(op.requirementIds??[]).includes(r.id));
  const exact=overrides[r.id];
 const explicit=r.source.section==='40';
 const proposed=exact??{firstImplementation:explicit?r.implementation.milestone:null,laterValidation:[],note:explicit?'Original section 40 build-plan ownership':'Provisional routing only; clause modality, compound splitting and cross-cutting ownership require review'};
 const evidence=[...new Set([...r.implementation.evidence,...related.flatMap(t=>[...t.acceptance.flatMap(a=>a.evidence),...(t.deferral?[t.deferral.evidence]:[])])])].map(ref);
 return {requirementId:r.id,source:r.source,text:r.text,sourceTextSha256:crypto.createHash('sha256').update(r.text).digest('hex'),
  modality:{explicitTokens:[...new Set(r.text.match(/\b(?:MUST|SHOULD|MAY)\b/g)??[])],classification:r.id.startsWith('SECTION-')?'section-marker':explicit&&r.text.trim().startsWith('- ')?'build-or-exit-clause':'needs-clause-review',note:'Examples, recommendations, proposed resources and headings are not converted to MUST by trace IDs'},
  originalImplementation:r.implementation,mapping:proposed,mappingAuthority:explicit?'original-build-plan':exact?'review-reconciliation':'provisional-needs-review',
  implementationTasks:related.map(t=>({id:t.id,status:t.status,startedAt:t.startedAt,completedAt:t.completedAt,blockedReason:t.blockedReason??null,deferral:t.deferral??null,acceptance:t.acceptance})),
  api:ops.map(o=>({operationId:o.operationId,path:o.path,map:o.map,mapDigest:o.mapDigest,tests:o.tests??[],scenarios:o.scenarios??[]})),
  testReferences:[...new Set([...ops.flatMap(o=>o.tests??[]),...evidence.map(e=>e.path).filter(p=>p.startsWith('tests/'))])],
  plannedPRs:phasePlan.requirementOwners.filter(o=>o.requirementId===r.id).map(o=>({milestone:o.milestone,id:o.primaryPr,kind:o.kind,acceptance:plan.find(p=>p.id===o.milestone)?.prs.find(pr=>pr.id===o.primaryPr)?.acceptance??null})),
  evidence,verification:{currentCandidate:'not-run',historicalClaim:r.implementation.status==='tested'?'recorded-tested-see-original-evidence':'no-tested-claim',note:'No release candidate selected; source inspection and a passing task are not a current release pass'},
  owner:'AgentCI maintainers',blocker:related.some(t=>t.blockedReason||t.deferral)?related.filter(t=>t.blockedReason||t.deferral).map(t=>({task:t.id,reason:t.blockedReason??t.deferral.reason,deferral:t.deferral??null})):explicit?null:'Clause-level ownership/test/evidence reconciliation remains open where links are absent',rerunTrigger:'Changed relevant implementation, contract, verifier, policy, provider access or release candidate',
  reconciliationGaps:[...(!explicit&&!exact?['modality-and-multi-phase-mapping-review']:[]),...(!evidence.length?['no-row-evidence']:[]),...(!ops.length&&!related.length?['no-task-or-operation-link']:[])]};
});
const sourceLines=fs.readFileSync('specs/agentci-full-spec.md','utf8').split('\n');
const children=[];
for(const [parent,start,end] of [['SPEC-31.1-001',1713,1732],['SPEC-32-002',1763,1775]]){
 for(let i=start-1;i<end;i++){
 const text=sourceLines[i].trim();if(!(text.startsWith('/v1/')||text.startsWith('agentci ')))continue;
 const key=text.replace(/[^a-z0-9]+/gi,'-').replace(/-$/,'');
 children.push({id:`${parent}/${key}`,parentId:parent,source:{path:'specs/agentci-full-spec.md',line:i+1},text,modality:parent.startsWith('SPEC-31')?'proposed-endpoint':'initial-command',implementation:'not-claimed',verification:'not-run',mapping:'M0 skeleton; staged domain implementation per report',blocker:'Exact operation/CLI coverage and milestone disposition require review; not silently mandatory or waived'});
 }
}
const ledgers=['M0','M1','M2','M3'].map(m=>{
 const p=`releases/${m.toLowerCase()}-gates.json`;return fs.existsSync(p)?{milestone:m,record:ref(p),...JSON.parse(fs.readFileSync(p))}:{milestone:m,record:null,note:'Use historical M0 manifest/release document; do not invent modern gate evidence'};
});
const d={schemaVersion:1,authority:'Requested audit snapshot; does not adopt review document or new numeric gates',specificationAuditBasisCommit:'8004caf94512cbce12bb3c7adcc951555b6aa0ce',snapshotInputs:{tasks:ref('delivery/tasks.json'),phasePlan:ref('delivery/phase-pr-plan.json'),apiSchema:ref('specs/api/openapi.json'),apiVersion:JSON.parse(fs.readFileSync('specs/api/openapi.json')).info.version},source:{spec:ref('specs/agentci-full-spec.md'),inventory:ref('specs/requirements.yaml'),addendumSha256:'58c9610814b784c0c306e4b7b707651add5239c2ab36ee45bb4d1fc6f40a4714'},numericProposalsAdopted:false,rows,derivedChildren:children,historicalGateSnapshots:ledgers,phasePlans:plan};
const sections=Array.from({length:51},(_,i)=>i+1).map(n=>{
 const values=rows.filter(r=>Number(r.source.section.split('.')[0])===n),file=root+'sections/'+String(n).padStart(2,'0')+'.json',text=JSON.stringify({section:n,rows:values},null,2)+'\n';
 return {file,text,count:values.length,sha256:crypto.createHash('sha256').update(text).digest('hex')};
});
const {rows:embeddedRows,...metadata}=d;
const rendered=JSON.stringify({...metadata,rowCount:rows.length,rowFiles:sections.map(({file,count,sha256})=>({path:file,count,sha256}))},null,2)+'\n';const dest=root+'requirement-test-evidence.json';
if(process.argv.includes('--check')){
 if(fs.readFileSync(dest,'utf8')!==rendered)throw Error('Reconciliation snapshot stale');
 for(const section of sections)if(fs.readFileSync(section.file,'utf8')!==section.text)throw Error('Reconciliation section stale '+section.file);
 for(const artifact of [{file:dest,text:rendered},...sections])if(Buffer.byteLength(artifact.text)>2*1024*1024)throw Error('Artifact exceeds AgentCI per-file review limit '+artifact.file);
 if(new Set(rows.map(r=>r.requirementId)).size!==inventory.length)throw Error('Lost or duplicate IDs');
 for(let n=1;n<=51;n++)if(!rows.some(r=>r.requirementId===`SECTION-${n}`))throw Error('Lost section '+n);
 for(let n=0;n<=10;n++)if(!rows.some(r=>r.source.section==='40'&&r.mapping.firstImplementation===`M${n}`))throw Error('Lost phase '+n);
 for(const owner of phasePlan.requirementOwners)if(!rows.find(r=>r.requirementId===owner.requirementId)?.plannedPRs.some(p=>p.id===owner.primaryPr&&p.milestone===owner.milestone))throw Error('Lost planned owner '+owner.requirementId);
 for(const t of tasks.filter(t=>t.deferral))for(const id of t.requirementIds)if(!rows.find(r=>r.requirementId===id)?.implementationTasks.some(x=>x.id===t.id&&JSON.stringify(x.deferral)===JSON.stringify(t.deferral)))throw Error('Lost deferral '+t.id);
 if(rows.some(r=>r.verification.currentCandidate!=='not-run'))throw Error('Unexpected pass promotion');
 console.log(`${rows.length} source IDs, ${children.length} fenced command/resource children, M0–M10 preserved; no current acceptance inferred.`);
}else{fs.mkdirSync(root+'sections',{recursive:true});for(const section of sections)fs.writeFileSync(section.file,section.text);fs.writeFileSync(dest,rendered);console.log(`Snapshot ${rows.length} IDs; open gaps remain explicit.`);}
