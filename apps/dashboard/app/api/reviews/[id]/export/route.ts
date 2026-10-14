import {protectedRetainedRead} from '../../../../../lib/protected-retained-route';
import {readReviewExport} from '../../../../../lib/retained-reads';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return protectedRetainedRead(request,context.params,(principal,binding,signal)=>readReviewExport(principal,binding,signal));}
