export type JsonValue=null|boolean|number|string|JsonValue[]|{[key:string]:JsonValue};
export interface ToolCall {id:string;name:string;arguments:Record<string,JsonValue>}
export interface ModelRequest {
 schemaVersion:'v1alpha1';requestId:string;provider:string;model:string;
 system:string;developer:string;
 messages:{role:'user'|'assistant'|'tool';content:string;toolCallId?:string;toolCalls?:ToolCall[]}[];
 tools:{name:string;description:string;inputSchema:Record<string,JsonValue>}[];
 responseSchema:Record<string,JsonValue>|null;
 parameters:{maxOutputTokens:number;temperature?:number;topP?:number;stop?:string[]};
 metadata:Record<string,string>;
 policy:{deadlineAt:number;maxAttempts:number;baseDelayMs:number;maxDelayMs:number};
 providerExtensions:Record<string,Record<string,JsonValue>>;
}
export interface ModelCapabilities {stream:boolean;tools:boolean;structuredOutput:boolean;developerInstructions:boolean;extensions:boolean}
export interface ModelUsage {inputTokens:number|null;outputTokens:number|null;costUsdMicros:number|null;costKind:'reported'|'estimated'|'unknown';pricingRevision:string|null}
export interface CostEstimate {upperBoundUsdMicros:number;pricingRevision:string;maxInputTokens:number;maxOutputTokens:number}
export interface ModelResponse {
 schemaVersion:'v1alpha1';requestId:string;attemptId:string;provider:string;model:string;
 status:'completed'|'refused'|'incomplete';text:string;structuredOutput:JsonValue;
 toolCalls:ToolCall[];
 usage:ModelUsage;providerRequestId:string|null;
}
export type ProviderFailureCode='invalid-request'|'unsupported-capability'|'authentication'|'rate-limit'|'deadline'|'cancelled'|'budget-exhausted'|'transport'|'invalid-output'|'ambiguous-attempt';
export class ProviderFailure extends Error {
 constructor(public readonly code:ProviderFailureCode,public readonly retryable=false,public readonly dispatch:'not-sent'|'possibly-sent'='not-sent',public readonly retryAfterMs:number|null=null){
  // Do not include raw provider bodies, credentials, URLs or request text in errors.
  super(code);this.name='ProviderFailure';
 }
}
export interface ProviderContext {attemptId:string;signal:AbortSignal}
export type ModelEvent=
 | {type:'start';requestId:string;attemptId:string;provider:string;model:string}
 | {type:'text-delta';text:string}
 | {type:'tool-delta';id:string;name:string|null;argumentsDelta:string}
 | {type:'usage';usage:ModelUsage}
 | {type:'terminal';response:ModelResponse};
export interface ModelProvider {
 readonly id:string;
 /** Trusted upstream identity; two aliases for one upstream are not independent. */
 readonly upstreamIdentity:string;
 capabilities():ModelCapabilities;
 invoke(request:ModelRequest,context:ProviderContext):Promise<ModelResponse>;
 stream(request:ModelRequest,context:ProviderContext):AsyncIterable<ModelEvent>;
 estimateCost?(request:ModelRequest):CostEstimate;
}
