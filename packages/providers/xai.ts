import {xAIResponse} from './xai-response.ts';
import {createXAITransport} from './xai-transport.ts';
import {XAIStreamTranslator} from './xai-stream.ts';
import {xAIRequest} from './xai-request.ts';
import {xAIHistory} from './xai-continuation.ts';
import {validateModelRequest} from './request.ts';
import {ProviderFailure,type ModelProvider,type ModelRequest,type ModelCapabilities} from './types.ts';
export interface XAIModelProfile {
 /** Exact upstream identities approved for this alias, covered by the same price/capability bounds. */
 responseModels?:string[];
 /** Models with signed reasoning require original continuation for every tool turn. */
 requireToolContinuation?:boolean;
 model:string;contextTokens:number;maxOutputTokens:number;
 capabilities:ModelCapabilities;temperature:boolean;topP:boolean;
 /** Upper prices must cover applicable context/service tiers; no cached-input discount. */
 inputUsdMicrosPerMillion:number;outputUsdMicrosPerMillion:number;pricingRevision:string;
}
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;
/** Profiles and credentials are trusted operator configuration, never model-generated input. */
export function createXAIProvider(apiKey:string,profiles:XAIModelProfile[],fetchImpl?:typeof fetch):ModelProvider{
 if(!Array.isArray(profiles)||!profiles.length||profiles.length>64)throw new ProviderFailure('invalid-request');
 const models=new Map<string,XAIModelProfile>();
 for(const supplied of profiles){
  const p=structuredClone(supplied);
  if(typeof p.model!=='string'||!p.model.length||p.model.length>256||models.has(p.model)||!positive(p.contextTokens)||!positive(p.maxOutputTokens)||p.maxOutputTokens>p.contextTokens||!positive(p.inputUsdMicrosPerMillion)||!positive(p.outputUsdMicrosPerMillion)||typeof p.pricingRevision!=='string'||!p.pricingRevision.length||p.pricingRevision.length>256||typeof p.temperature!=='boolean'||typeof p.topP!=='boolean'||!p.capabilities||['stream','tools','structuredOutput','developerInstructions','extensions'].some(key=>typeof p.capabilities[key as keyof ModelCapabilities]!=='boolean'))throw new ProviderFailure('invalid-request');
  if(p.responseModels!==undefined&&(!Array.isArray(p.responseModels)||!p.responseModels.length||p.responseModels.length>32||new Set(p.responseModels).size!==p.responseModels.length||p.responseModels.some(model=>typeof model!=='string'||!model.length||model.length>256)))throw new ProviderFailure('invalid-request');
  if(p.requireToolContinuation!==undefined&&typeof p.requireToolContinuation!=='boolean'||p.requireToolContinuation&&(!p.capabilities.extensions||!p.capabilities.tools))throw new ProviderFailure('invalid-request');
  models.set(p.model,p);
 }
 const registered=[...models.values()];
 const transport=createXAITransport(apiKey,fetchImpl);
 const prepare=(input:ModelRequest,stream=false)=>{
  const request=validateModelRequest(input),profile=models.get(request.model);
  if(!profile||request.provider!=='xai')throw new ProviderFailure('invalid-request');
  const c=profile.capabilities;
  if(stream&&!c.stream||request.tools.length&&!c.tools||request.messages.some(m=>m.toolCalls?.length||m.role==='tool')&&!c.tools||request.responseSchema&&!c.structuredOutput||request.developer&&!c.developerInstructions||Object.keys(request.providerExtensions.xai??{}).length&&!c.extensions||request.parameters.temperature!==undefined&&!profile.temperature||request.parameters.topP!==undefined&&!profile.topP||request.parameters.maxOutputTokens>profile.maxOutputTokens)throw new ProviderFailure('unsupported-capability');
  xAIRequest(request);
  if(profile.requireToolContinuation){
   const history=xAIHistory(request);
   if(request.messages.some((message,index)=>message.role==='assistant'&&message.toolCalls?.length&&!history.has(index)))throw new ProviderFailure('invalid-request');
  }
  return {request,profile};
 };
 return {
  id:'xai',upstreamIdentity:'xai',
  capabilities:()=>({stream:registered.some(p=>p.capabilities.stream),tools:registered.some(p=>p.capabilities.tools),structuredOutput:registered.some(p=>p.capabilities.structuredOutput),developerInstructions:registered.some(p=>p.capabilities.developerInstructions),extensions:registered.some(p=>p.capabilities.extensions)}),
  estimateCost(input){
   const {request,profile}=prepare(input);
   // Reserve a full context at the configured upper input price, plus capped output.
   // This avoids claiming a heuristic tokenizer estimate is a guaranteed billing bound.
   const numerator=BigInt(profile.contextTokens)*BigInt(profile.inputUsdMicrosPerMillion)+BigInt(request.parameters.maxOutputTokens)*BigInt(profile.outputUsdMicrosPerMillion);
   const upper=(numerator+999999n)/1000000n;if(upper>BigInt(Number.MAX_SAFE_INTEGER))throw new ProviderFailure('invalid-request');
   return {upperBoundUsdMicros:Number(upper),pricingRevision:profile.pricingRevision,maxInputTokens:profile.contextTokens,maxOutputTokens:request.parameters.maxOutputTokens};
  },
  async invoke(input,context){const {request,profile}=prepare(input);const raw=await transport.raw(request,context);return xAIResponse(raw.payload,request,context.attemptId,raw.requestId,profile.responseModels??[request.model]);},
  async *stream(input,context){
   const {request,profile}=prepare(input,true),translator=new XAIStreamTranslator(request,context.attemptId,profile.responseModels??[request.model]);
   for await(const frame of transport.events(request,context))for(const event of translator.accept(frame.event,frame.requestId))yield event;
   translator.finish();
  }
 };
}
