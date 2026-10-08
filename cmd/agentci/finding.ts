import {open,constants} from 'node:fs/promises';
import {validateFindingReproductionRequest,validateFindingReproductionAccepted} from '../../packages/findings/reproduction-transport.ts';
import {once} from 'node:events';
import {ModelReviewClient} from '../../packages/client/model-review.ts';
import {AgentCIError} from '../../packages/client/index.ts';
import {loadModelReviewClientConfig, loadModelReviewRequest} from './model-review.ts';

async function reproductionReferenceFile(path:string,request:Awaited<ReturnType<typeof loadModelReviewRequest>>) {
  let handle;
  try {
    handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const stat=await handle.stat();
    if(!stat.isFile()||stat.size>8192)throw Error();
    const buffer=Buffer.alloc(8193);let bytes=0;
    while(bytes<buffer.length){const read=await handle.read(buffer,bytes,buffer.length-bytes,null);if(!read.bytesRead)break;bytes+=read.bytesRead;}
    if(bytes>8192)throw Error();const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,bytes)));
    return validateFindingReproductionAccepted(value,{id:value.id,reviewId:request.id,subject:request.subject});
  }catch{throw new AgentCIError('invalid-reproduction-reference-file');}finally{await handle?.close();}
}

async function reservationFile(path:string) {
 let handle;try{handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);if(!(await handle.stat()).isFile())throw Error();const b=Buffer.alloc(4097);let n=0;while(n<b.length){const r=await handle.read(b,n,b.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}if(n>4096)throw Error();return validateFindingReproductionRequest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(0,n))));}catch{throw new AgentCIError('invalid-reservation-file');}finally{await handle?.close();}
}

export async function findingCommand(args: string[]): Promise<number> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) {
    console.log(`Usage: agentci finding show --request ADMISSION_JSON --id SHA256_ID [--version N] [--config PRIVATE_JSON]
       agentci finding reserve-reproduction --request ADMISSION_JSON --id SHA256_ID --reservation RESERVATION_JSON [--config PRIVATE_JSON]
       agentci finding reproduction-status --request ADMISSION_JSON --reproduction REFERENCE_JSON [--config PRIVATE_JSON]
       agentci finding cancel-reproduction --request ADMISSION_JSON --reproduction REFERENCE_JSON [--config PRIVATE_JSON]
       agentci finding history --request ADMISSION_JSON --id SHA256_ID [--limit PAGE_SIZE] [--config PRIVATE_JSON]

show     Read the current finding; --version selects an immutable historical event.
history  Stream verified JSON pages through one fixed version watermark.
         Complete history requires successful exit and a final page with nextCursor:null.

Use original admission JSON to pin review identity. Model-review findings returns
original-summary references; current dispositions may differ. --limit is 1..100.
Credentials use private 0600 config/token files or AGENTCI_API_URL and the
AGENTCI_EVIDENCE_TOKEN/AGENTCI_OPERATOR_TOKEN environment. Never pass tokens in argv.
Exit 0 means a verified read, not a confirmed defect or passing review. Errors exit 2.
reproduction-status verifies retained status against the complete captured reference.
cancel-reproduction requires an operator token and verifies identity before durable intent.
Cancellation acknowledgement does not certify stopping, cleanup or assertion success.
reserve-reproduction selects an existing approved plan; acknowledgement means durable intent.
Disposition commands remain unavailable.`);
    return 0;
  }
  try {
    const [command, ...flags] = args;
    if (!command || !['show', 'history','reserve-reproduction','reproduction-status','cancel-reproduction'].includes(command)) throw new AgentCIError('invalid-finding-arguments');
    const reservation=command==='reserve-reproduction';
    const reproduction=command==='reproduction-status'||command==='cancel-reproduction';
    const options: Record<string, string> = {};
    for (let i = 0; i < flags.length; i += 2) {
      const name = flags[i], value = flags[i + 1];
      const allowed = reservation?['--request','--id','--reservation','--config']:reproduction?['--request','--reproduction','--config']:['--request', '--id', '--config', command === 'show' ? '--version' : '--limit'];
      if (!name || !allowed.includes(name) || !value || value.startsWith('--') || Object.hasOwn(options, name)) throw new AgentCIError('invalid-finding-arguments');
      options[name] = value;
    }
    if (!options['--request'] || (reproduction?!options['--reproduction']:!options['--id'] || !/^sha256:[a-f0-9]{64}$/.test(options['--id']))) throw new AgentCIError('invalid-finding-arguments');
    if(reservation&&!options['--reservation'])throw new AgentCIError('invalid-finding-arguments');
    const numeric = options[command === 'show' ? '--version' : '--limit'];
    if (numeric !== undefined && (!/^[1-9][0-9]*$/.test(numeric) || Number(numeric) > (command === 'show' ? 10000 : 100))) throw new AgentCIError('invalid-finding-arguments');
    const client = new ModelReviewClient(await loadModelReviewClientConfig(options['--config']));
    const request = await loadModelReviewRequest(options['--request']);
    if(reservation)console.log(JSON.stringify(await client.reserveReproduction(request,options['--id']!,await reservationFile(options['--reservation']!))));
    else if(reproduction){const reference=await reproductionReferenceFile(options['--reproduction']!,request);console.log(JSON.stringify(command==='reproduction-status'?await client.reproductionStatus(request,reference):await client.cancelReproduction(request,reference)));}
    else if (command === 'show') console.log(JSON.stringify(await client.finding(request, options['--id']!, {version: numeric ? Number(numeric) : undefined})));
    else for await (const page of client.findingHistory(request, options['--id']!, {limit: numeric ? Number(numeric) : undefined})) {
      if (!process.stdout.write(JSON.stringify(page) + '\n')) await once(process.stdout, 'drain');
    }
    return 0;
  } catch (error) {
    console.error(JSON.stringify({error: {code: error instanceof AgentCIError ? error.code : 'finding-read-unavailable'}})); return 2;
  }
}
