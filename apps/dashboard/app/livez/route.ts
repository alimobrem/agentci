export const dynamic='force-dynamic';
/** Process liveness only; reveals no runtime configuration or dependency identities. */
export function GET(){return Response.json({status:'live'},{headers:{'cache-control':'private, no-store'}});}
