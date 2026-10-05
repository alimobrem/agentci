import {canonical, digest} from '../review/engine.ts';
import {invokeModel} from '../providers/execute.ts';
import type {BudgetLedger} from '../providers/budget.ts';
import type {ModelProvider} from '../providers/types.ts';
import {createIndependencePolicy, ReviewPolicyFailure, type TrustedCodingProvenance} from './independence.ts';
import {prepareReviewerRequest, type ReviewerRequestConfig} from './request.ts';

export interface ReviewerExecutionInput {
  requestId: string;
  config: ReviewerRequestConfig;
  subject: unknown;
  documents: unknown;
  coding: TrustedCodingProvenance | null;
  differentProvider: boolean;
  mode: 'synthetic' | 'external';
}

/** Controller-owned provider and tenant-scoped ledger bindings. Creating this
 * executor is not authentication or spend authorization; the caller supplies those.
 * Model/repository data cannot select another ledger or register a provider.
 */
export function createReviewerExecutor(
  registrations: readonly {provider: ModelProvider; execution: 'fixture' | 'external'}[],
  scope: {organizationId: string; repository: string},
  ledger: BudgetLedger,
) {
  const independence = createIndependencePolicy(registrations);
  const tenant = {...scope};
  const providers = new Map(registrations.map(({provider}) => [provider.id, Object.freeze({
    id: provider.id, upstreamIdentity: provider.upstreamIdentity,
    capabilities: provider.capabilities.bind(provider), invoke: provider.invoke.bind(provider),
    stream: provider.stream.bind(provider), estimateCost: provider.estimateCost?.bind(provider),
  })]));
  return async (input: ReviewerExecutionInput, signal?: AbortSignal) => {
    const prepared = prepareReviewerRequest(input.requestId, input.config, input.subject, input.documents);
    if (prepared.context.subject.organizationId !== tenant.organizationId || prepared.context.subject.repository !== tenant.repository) throw new ReviewPolicyFailure('wrong-subject');
    const decision = independence({headSha: prepared.context.subject.headSha,
      reviewerProviderId: prepared.request.provider, coding: input.coding,
      differentProvider: input.differentProvider, mode: input.mode});
    const provider = providers.get(prepared.request.provider);
    if (!provider) throw new ReviewPolicyFailure('unknown-provider');
    // Bind the policy decision into the same request identity used by budget replay protection.
    const coding = input.coding ? {...input.coding} : null;
    const authorizationDigest = digest(canonical({decision, coding}));
    prepared.request.metadata.authorizationDigest = authorizationDigest;
    const requestDigest = digest(canonical(prepared.request));
    const response = await invokeModel(provider, prepared.request, ledger, signal);
    // Hidden continuation material is excluded from reviewer evidence and proposals.
    const publicResponse = {status: response.status, text: response.text,
      structuredOutput: response.structuredOutput, usage: response.usage,
      observedModel: response.observedModel ?? null, providerRequestId: response.providerRequestId};
    return {
      schemaVersion: 'v1alpha1' as const, mode: decision.mode, subject: prepared.context.subject,
      role: prepared.request.metadata.role!, requestId: prepared.request.requestId,
      attemptId: response.attemptId, provider: response.provider, model: response.model,
      status: response.status, independence: decision, coding, authorizationDigest,
      configDigest: prepared.configDigest, promptDigest: prepared.promptDigest,
      contextDigest: prepared.context.digest, requestDigest,
      responseDigest: digest(canonical(publicResponse)), response: publicResponse,
      proposal: response.status === 'completed'
        ? {verification: 'proposed' as const, output: structuredClone(response.structuredOutput)} : null,
    };
  };
}
