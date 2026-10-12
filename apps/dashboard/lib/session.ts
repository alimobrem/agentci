import {randomBytes,timingSafeEqual} from 'node:crypto';
export const SESSION_COOKIE='__Host-agentci-session', TRANSACTION_COOKIE='__Host-agentci-login';
export const privateHeaders={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie','Pragma':'no-cache'};
export interface Principal {issuer:string;subject:string;organizationId:string;repositories:string[]}
interface Session {principal:Principal;expiresAt:number;csrf:string;viewBinding:string}
export class Sessions {
 #values=new Map<string,Session>();
 constructor(private ttlMs=30*60*1000,private now=Date.now,private capacity=1000){}
 create(principal:Principal,old?:string){this.revoke(old);for(const [id,s]of this.#values)if(s.expiresAt<=this.now())this.#values.delete(id);if(this.#values.size>=this.capacity)throw Error('session-capacity');const id=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url'),viewBinding=randomBytes(16).toString('hex');this.#values.set(id,{principal:structuredClone(principal),expiresAt:this.now()+this.ttlMs,csrf,viewBinding});return {id,csrf,viewBinding};}
 read(id:string|undefined){if(!id||!/^[A-Za-z0-9_-]{43}$/.test(id))throw Error('unauthorized');const s=this.#values.get(id);if(!s||s.expiresAt<=this.now()){this.#values.delete(id);throw Error('unauthorized');}return structuredClone(s);}
 revoke(id?:string){if(id)this.#values.delete(id);}
}
export function requireOrigin(request:Request,origin:string){if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')throw Error('forbidden');}
export function requireCsrf(request:Request,origin:string,expected:string){requireOrigin(request,origin);const value=request.headers.get('x-agentci-csrf')??'';if(value.length!==expected.length||!timingSafeEqual(Buffer.from(value),Buffer.from(expected)))throw Error('forbidden');}
export function cookie(request:Request,name:string){const values=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));if(values.length!==1)return undefined;return values[0].slice(name.length+1);}
export function setCookie(name:string,value:string,seconds:number){return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;}
export function authorize(principal:Principal,organizationId:string,repository:string){if(principal.organizationId!==organizationId||!principal.repositories.includes(repository))throw Error('forbidden');}
