import {createHash} from 'node:crypto';
import {canonical} from '../review/engine.ts';
import type {ModelRequest} from './types.ts';
/** Bind continuation to the exact preceding instructions, tools and conversation. */
export function anthropicPrefixDigest(request:ModelRequest):string{
 return createHash('sha256').update(canonical({provider:request.provider,model:request.model,system:request.system,developer:request.developer,tools:request.tools,responseSchema:request.responseSchema,messages:request.messages,history:request.providerExtensions.anthropic?.history??[]})).digest('hex');
}
