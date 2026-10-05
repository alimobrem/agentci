import type {XAIModelProfile} from './xai.ts';
/** Opt-in global/default-service profile. 128k is our output cap, not a claimed model maximum. */
export function xAIGrokProfile():XAIModelProfile{
 return {model:'grok-4.7',responseModels:['grok-4.7'],requireToolContinuation:true,contextTokens:500_000,maxOutputTokens:128_000,
  capabilities:{stream:true,tools:true,structuredOutput:true,developerInstructions:true,extensions:true},temperature:true,topP:true,
  inputUsdMicrosPerMillion:4_000_000,outputUsdMicrosPerMillion:12_000_000,pricingRevision:'xai-global-standard-long-context-2026-10-05'};
}
