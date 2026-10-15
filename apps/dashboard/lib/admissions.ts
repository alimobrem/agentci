import 'server-only';
import type {ReviewBinding} from './dashboard';
/** Validate before any public list/SSR/RSC projection; never forward raw configuration. */
export async function validatedReviewBindings(reviews:Record<string,ReviewBinding>){
 const {validateReviewAdmission}=await import(/* webpackIgnore: true */ 'agentci/client');
 return Object.fromEntries(Object.entries(reviews).map(([id,binding])=>{const admission=validateReviewAdmission(binding.admission);if(admission.id!==id||binding.comparison&&!binding.semanticEvidenceId||[binding.semanticEvidenceId,binding.comparison?.id,binding.comparison?.attemptId].some(value=>value!==undefined&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value))||binding.reviewerComparison!==undefined&&typeof binding.reviewerComparison!=='boolean')throw Error('invalid-review-configuration');return [id,{admission,apiOrigin:binding.apiOrigin,readToken:binding.readToken,semanticEvidenceId:binding.semanticEvidenceId,comparison:binding.comparison,reviewerComparison:binding.reviewerComparison}];}));
}
