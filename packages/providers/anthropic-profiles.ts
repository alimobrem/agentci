import type {AnthropicModelProfile} from './anthropic.ts';
/** Opt-in reviewed limits/prices; live and thinking-history acceptance remain separate gates. */
export function anthropicOpusProfile():AnthropicModelProfile{
 return {model:'claude-opus-5-5',responseModels:['claude-opus-5-5'],requireSignedToolHistory:true,contextTokens:1_000_000,maxOutputTokens:128_000,
  capabilities:{stream:true,tools:true,structuredOutput:true,developerInstructions:false,extensions:true},temperature:false,topP:false,
  inputUsdMicrosPerMillion:8_000_000,outputUsdMicrosPerMillion:20_000_000,pricingRevision:'anthropic-standard-opus-5-5-2026-10-05'};
}
