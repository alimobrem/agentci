import 'server-only';
import {z} from 'zod';
import {Login} from './oidc';
import {Sessions} from './session';
import type {ReviewBinding} from './dashboard';
const principal=z.object({issuer:z.string().url(),subject:z.string().min(1).max(256),organizationId:z.uuid(),repositories:z.array(z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)).max(100)}).strict();
const configSchema=z.object({issuer:z.string().url(),clientId:z.string().min(1),clientSecret:z.string().min(1),origin:z.string().url(),grants:z.record(z.string(),principal),reviews:z.record(z.uuid(),z.object({admission:z.unknown(),apiOrigin:z.string().url(),readToken:z.string().min(32),semanticEvidenceId:z.uuid().optional(),comparison:z.object({id:z.uuid(),attemptId:z.uuid()}).strict().optional(),reviewerComparison:z.boolean().optional()}).strict())}).strict();
// Sessions and pending login transactions are process-local. Restart revokes both; replicas need shared stores.
const globalState=globalThis as typeof globalThis & {agentciDashboardRuntime?:ReturnType<typeof createRuntime>};
function createRuntime(){const text=process.env.AGENTCI_DASHBOARD_CONFIG;if(!text||Buffer.byteLength(text)>1024*1024)throw Error('dashboard-unconfigured');const config=configSchema.parse(JSON.parse(text));return {origin:config.origin,login:new Login(config),sessions:new Sessions(),reviews:config.reviews as Record<string,ReviewBinding>};}
export function runtime(){return globalState.agentciDashboardRuntime??=createRuntime();}
