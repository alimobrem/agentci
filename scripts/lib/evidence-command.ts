import {readFile,appendFile,open,unlink,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {validateEvidenceHistory,validateEvidenceRecord,reusableEvidence,verifyEvidenceProof,evidenceMeasurements,type EvidenceRecord,type EvidenceInvalidation,type EvidenceIdentity} from './evidence-reuse.ts';
async function lines<T>(path:string):Promise<T[]>{try{return (await readFile(path,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}}
export async function evidenceCommand(action:string|undefined,args:string[]){
 if(!['record','reuse','invalidate','report'].includes(action??''))throw new Error('Evidence action: record FILE, reuse FILE, invalidate ID REASON, report');
 await mkdir('delivery',{recursive:true});
 // Serialize read/validate/append so two writers cannot bypass the repeat guard.
 const lock=await open('delivery/.evidence.lock','wx');
 try{
  const records=await lines<EvidenceRecord>('delivery/evidence-records.jsonl'),invalidations=await lines<EvidenceInvalidation>('delivery/evidence-invalidations.jsonl');validateEvidenceHistory(records,invalidations);
  if(action==='record'){
   if(args.length!==1)throw new Error('Evidence record requires one JSON file');
   const input=JSON.parse(await readFile(args[0]!,'utf8'));
   const allowed=['sourceCommit','artifactDigest','platform','verifierRevision','subject','boundary','coverage','result','reason','proof','seconds','cache'];
   if(!input||typeof input!=='object'||Object.keys(input).sort().join(',')!==allowed.sort().join(','))throw new Error('Unexpected evidence input fields');
   const record:EvidenceRecord={...input,id:randomUUID(),recordedAt:new Date().toISOString()};
   validateEvidenceRecord(record);validateEvidenceHistory([...records,record],invalidations);await verifyEvidenceProof(record);
   await appendFile('delivery/evidence-records.jsonl',JSON.stringify(record)+'\n');console.log(JSON.stringify({id:record.id,result:record.result}));
  }else if(action==='reuse'){
   if(args.length!==1)throw new Error('Evidence reuse requires one identity JSON file');
   const request=JSON.parse(await readFile(args[0]!,'utf8')) as EvidenceIdentity;
   if(Object.keys(request).sort().join(',')!==['sourceCommit','artifactDigest','platform','verifierRevision','subject','boundary','coverage'].sort().join(','))throw new Error('Unexpected evidence identity fields');
   const record=reusableEvidence(request,records,invalidations);
   if(record){await verifyEvidenceProof(record);console.log(JSON.stringify({reusable:true,id:record.id,proof:record.proof,coverage:record.coverage}));}
   else{console.log(JSON.stringify({reusable:false,reason:'No current matching passed evidence with requested coverage'}));process.exitCode=1;}
  }else if(action==='invalidate'){
   if(!args[0]||!args.slice(1).join(' ').trim())throw new Error('Evidence invalidation requires ID and reason');
   const event={recordId:args[0],reason:args.slice(1).join(' '),at:new Date().toISOString()};validateEvidenceHistory(records,[...invalidations,event]);
   await appendFile('delivery/evidence-invalidations.jsonl',JSON.stringify(event)+'\n');console.log('Evidence invalidation retained.');
  }else{if(args.length)throw new Error('Evidence report takes no arguments');console.log(JSON.stringify(evidenceMeasurements(records),null,2));}
 }finally{await lock.close();await unlink('delivery/.evidence.lock');}
}
