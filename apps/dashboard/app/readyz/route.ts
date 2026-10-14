import {runtime} from '../../lib/runtime';
import {validatedReviewBindings} from '../../lib/admissions';
export const dynamic='force-dynamic';
/** Local configuration readiness only; issuer and evidence-backend availability are separate checks. */
export async function GET(){
 try{await validatedReviewBindings(runtime().reviews);return Response.json({status:'configured'},{headers:{'cache-control':'private, no-store'}});}
 catch{return Response.json({status:'unavailable'},{status:503,headers:{'cache-control':'private, no-store'}});}
}
