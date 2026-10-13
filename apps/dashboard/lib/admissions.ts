import 'server-only';
import type {ReviewBinding} from './dashboard';
/** Validate before any public list/SSR/RSC projection; never forward raw configuration. */
export async function validatedReviewBindings(reviews:Record<string,ReviewBinding>){
 const {validateReviewAdmission}=await import(/* webpackIgnore: true */ 'agentci/client');
 return Object.fromEntries(Object.entries(reviews).map(([id,binding])=>{const admission=validateReviewAdmission(binding.admission);if(admission.id!==id)throw Error('invalid-review-configuration');return [id,{admission,apiOrigin:binding.apiOrigin,readToken:binding.readToken}];}));
}
