import type {OpenAIModelProfile} from './openai.ts';

/** Opt-in profile; importing this module does not enable a provider or spend money. */
export function openAILunaProfile():OpenAIModelProfile{
 return {
  model:'gpt-6-luna',responseModels:['gpt-6-luna'],contextTokens:1_050_000,maxOutputTokens:128_000,
  capabilities:{stream:true,tools:true,structuredOutput:true,developerInstructions:true,extensions:true},
  // Sampling overrides are deliberately disabled in this reviewed profile.
  temperature:false,topP:false,
  // Standard service, long-context rates. Input also covers the cache-write premium.
  inputUsdMicrosPerMillion:250_000,outputUsdMicrosPerMillion:750_000,
  pricingRevision:'openai-standard-luna-2026-10-05'
 };
}
