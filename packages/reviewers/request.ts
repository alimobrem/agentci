import {canonical, digest} from '../review/engine.ts';
import {validateModelRequest} from '../providers/request.ts';
import type {ModelRequest} from '../providers/types.ts';
import {buildReviewContext} from './context.ts';
import {reviewerInstructions, type ReviewerRole} from './roles.ts';

export interface ReviewerRequestConfig {
  role: ReviewerRole;
  policyVersion: string;
  provider: string;
  model: string;
  parameters: ModelRequest['parameters'];
  policy: ModelRequest['policy'];
  responseSchema: NonNullable<ModelRequest['responseSchema']>;
  providerExtensions: ModelRequest['providerExtensions'];
}

/** Pure request assembly. Configuration is controller-owned, not repository input.
 * No tools are granted. Policy authorization and budgeted dispatch remain separate.
 */
export function prepareReviewerRequest(requestId: string, config: ReviewerRequestConfig, subject: unknown, documents: unknown) {
  if (!config || typeof config.policyVersion !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(config.policyVersion) || !config.responseSchema) throw new Error('invalid-reviewer-config');
  const context = buildReviewContext(subject, documents);
  const system = reviewerInstructions(config.role);
  const request = validateModelRequest({
    schemaVersion: 'v1alpha1', requestId, provider: config.provider, model: config.model,
    system, developer: '', messages: [{role: 'user', content: context.content}],
    tools: [], responseSchema: config.responseSchema, parameters: config.parameters,
    policy: config.policy, providerExtensions: config.providerExtensions, metadata: {},
  });
  const configDigest = digest(canonical({role: config.role, policyVersion: config.policyVersion,
    provider: request.provider, model: request.model, parameters: request.parameters,
    policy: request.policy, responseSchema: request.responseSchema, providerExtensions: request.providerExtensions}));
  const promptDigest = digest(canonical({system: request.system, developer: request.developer}));
  request.metadata = {role: config.role, policyVersion: config.policyVersion, configDigest, promptDigest,
    contextDigest: context.digest, headSha: context.subject.headSha};
  const validated = validateModelRequest(request);
  return {request: validated, context, configDigest, promptDigest, requestDigest: digest(canonical(validated))};
}
