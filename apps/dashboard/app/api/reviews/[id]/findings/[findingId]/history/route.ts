import {protectedRetainedRead} from '../../../../../../../lib/protected-retained-route';
import {readFindingHistory} from '../../../../../../../lib/retained-reads';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string;findingId:string}>}){return protectedRetainedRead(request,context.params,(principal,binding,signal,id)=>readFindingHistory(principal,binding,id!,signal));}
