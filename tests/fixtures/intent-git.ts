import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import type {Snapshot} from '../../packages/review/types.ts';
/** Synthetic authenticated-provider substitute; paths and query strings remain distinct. */
export function intentGitFixture(snapshots:Snapshot[]){
 const blobs=new Map<string,unknown>(),trees=new Map<string,unknown>(),requests:string[]=[];
 for(const snapshot of snapshots){trees.set(snapshot.sha,Object.entries(snapshot.files).map(([path,text])=>{const bytes=Buffer.from(text),sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');blobs.set(sha,{sha,encoding:'base64',content:bytes.toString('base64')});return {path,sha,size:bytes.length,type:'blob',mode:'100644'};}));}
 const server=createServer((req,res)=>{
  requests.push(req.url!);const parts=new URL(req.url!,'http://fixture.invalid').pathname.split('/'),sha=parts.at(-1)!,kind=parts.at(-2);
  const value=kind==='commits'&&trees.has(sha)?{sha,tree:{sha}}:kind==='trees'&&trees.has(sha)?{sha,truncated:false,tree:trees.get(sha)}:kind==='blobs'?blobs.get(sha):undefined;
  res.setHeader('content-type','application/json');if(req.method!=='GET'||value===undefined){res.writeHead(404);res.end(JSON.stringify({message:'Unknown synthetic Git request'}));return;}res.end(JSON.stringify(value));
 });return {server,requests};
}
