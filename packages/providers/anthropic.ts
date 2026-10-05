import {createAnthropicTransport} from './anthropic-transport.ts';
import {AnthropicStreamTranslator} from './anthropic-stream.ts';
import {anthropicRequest} from './anthropic-request.ts';
import {validateModelRequest} from './request.ts';
import {ProviderFailure,type ModelProvider,type ModelRequest,type ModelCapabilities} from './types.ts';
export interface AnthropicModelProfile {
 /** Exact upstream identities approved for this alias, covered by the same price/capability bounds. */
 responseModels?:string[];
 model:string;contextTokens:number;maxOutputTokens:number;
 capabilities:ModelCapabilities;temperature:boolean;topP:boolean;
 /** Upper prices must cover applicable context/service tiers; no cached-input discount. */
 inputUsdMicrosPerMillion:number;outputUsdMicrosPerMillion:number;pricingRevision:string;
}
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;
/** Profiles and credentials are trusted operator configuration, never model-generated input. */
export function createAnthropicProvider(apiKey:string,profiles:AnthropicModelProfile[],fetchImpl?:typeof fetch):ModelProvider{
 if(!Array.isArray(profiles)||!profiles.length||profiles.length>64)throw new ProviderFailure('invalid-request');
 const models=new Map<string,AnthropicModelProfile>();
 for(const supplied of profiles){
  const p=structuredClone(supplied);
  if(typeof p.model!=='string'||!p.model.length||p.model.length>256||models.has(p.model)||!positive(p.contextTokens)||!positive(p.maxOutputTokens)||p.maxOutputTokens>p.contextTokens||!positive(p.inputUsdMicrosPerMillion)||!positive(p.outputUsdMicrosPerMillion)||typeof p.pricingRevision!=='string'||!p.pricingRevision.length||p.pricingRevision.length>256||typeof p.temperature!=='boolean'||typeof p.topP!=='boolean'||!p.capabilities||['stream','tools','structuredOutput','developerInstructions','extensions'].some(key=>typeof p.capabilities[key as keyof ModelCapabilities]!=='boolean'))throw new ProviderFailure('invalid-request');
  if(p.responseModels!==undefined&&(!Array.isArray(p.responseModels)||!p.responseModels.length||p.responseModels.length>32||new Set(p.responseModels).size!==p.responseModels.length||p.responseModels.some(model=>typeof model!=='string'||!model.length||model.length>256)))throw new ProviderFailure('invalid-request');
  if(p.capabilities.developerInstructions||p.capabilities.extensions)throw new ProviderFailure('unsupported-capability');
  models.set(p.model,p);
 }
 const registered=[...models.values()];
 const transport=createAnthropicTransport(apiKey,fetchImpl);
 const prepare=(input:ModelRequest,stream=false)=>{
  const request=validateModelRequest(input),profile=models.get(request.model);
  if(!profile||request.provider!=='anthropic')throw new ProviderFailure('invalid-request');
  const c=profile.capabilities;
  if(stream&&!c.stream||request.tools.length&&!c.tools||request.messages.some(m=>m.toolCalls?.length||m.role==='tool')&&!c.tools||request.responseSchema&&!c.structuredOutput||request.developer&&!c.developerInstructions||Object.keys(request.providerExtensions.anthropic??{}).length&&!c.extensions||request.parameters.temperature!==undefined&&!profile.temperature||request.parameters.topP!==undefined&&!profile.topP||request.parameters.maxOutputTokens>profile.maxOutputTokens)throw new ProviderFailure('unsupported-capability');
  if(request.parameters.temperature!==undefined&&request.parameters.temperature>1)throw new ProviderFailure('unsupported-capability');
  anthropicRequest(request);return {request,profile};
 };
 return {
  id:'anthropic',upstreamIdentity:'anthropic',
  capabilities:()=>({stream:registered.some(p=>p.capabilities.stream),tools:registered.some(p=>p.capabilities.tools),structuredOutput:registered.some(p=>p.capabilities.structuredOutput),developerInstructions:registered.some(p=>p.capabilities.developerInstructions),extensions:registered.some(p=>p.capabilities.extensions)}),
  estimateCost(input){
   const {request,profile}=prepare(input);
   // Reserve a full context at the configured upper input price, plus capped output.
   // This avoids claiming a heuristic tokenizer estimate is a guaranteed billing bound.
   const numerator=BigInt(profile.contextTokens)*BigInt(profile.inputUsdMicrosPerMillion)+BigInt(request.parameters.maxOutputTokens)*BigInt(profile.outputUsdMicrosPerMillion);
   const upper=(numerator+999999n)/1000000n;if(upper>BigInt(Number.MAX_SAFE_INTEGER))throw new ProviderFailure('invalid-request');
   return {upperBoundUsdMicros:Number(upper),pricingRevision:profile.pricingRevision,maxInputTokens:profile.contextTokens,maxOutputTokens:request.parameters.maxOutputTokens};
  },
  async invoke(input,context){const {request,profile}=prepare(input);return transport.invoke(request,context,profile.responseModels??[request.model]);},
  async *stream(input,context){
   const {request,profile}=prepare(input,true),translator=new AnthropicStreamTranslator(request,context.attemptId,profile.responseModels??[request.model]);
   for await(const frame of transport.events(request,context))for(const event of translator.accept(frame.event,frame.requestId))yield event;
   translator.finish();
  }
 };
}
