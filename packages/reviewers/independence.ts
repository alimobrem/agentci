import type {ModelProvider} from '../providers/types.ts';

export interface TrustedProviderRegistration {
  provider: Pick<ModelProvider, 'id' | 'upstreamIdentity'>;
  execution: 'fixture' | 'external';
}
/** Supplied only by the authenticated controller after verifying its provenance.
 * This internal policy check does not authenticate signatures or repository claims.
 */
export interface TrustedCodingProvenance {
  providerId: string;
  model: string;
  headSha: string;
  evidenceDigest: string;
}
export interface IndependenceInput {
  headSha: string;
  reviewerProviderId: string;
  differentProvider: boolean;
  mode: 'synthetic' | 'external';
  coding: TrustedCodingProvenance | null;
}
export class ReviewPolicyFailure extends Error {
  constructor(public readonly code: 'invalid-policy' | 'unknown-provider' | 'missing-provenance' | 'wrong-subject' | 'same-upstream' | 'synthetic-provider' | 'external-provider') {
    super(code); this.name = 'ReviewPolicyFailure';
  }
}
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value);
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

/** Snapshots controller-owned identities so mutable adapter aliases cannot alter policy. */
export function createIndependencePolicy(registrations: readonly TrustedProviderRegistration[]) {
  const identities = new Map<string, {upstream: string; execution: 'fixture' | 'external'}>();
  if (!registrations.length || registrations.length > 128) throw new ReviewPolicyFailure('invalid-policy');
  for (const registration of registrations) {
    const {id, upstreamIdentity} = registration.provider;
    if (!identifier(id) || !identifier(upstreamIdentity) || identities.has(id) || !['fixture', 'external'].includes(registration.execution)) throw new ReviewPolicyFailure('invalid-policy');
    identities.set(id, {upstream: upstreamIdentity, execution: registration.execution});
  }
  return (input: IndependenceInput) => {
    if (!input || !sha(input.headSha) || !identifier(input.reviewerProviderId) || typeof input.differentProvider !== 'boolean' || !['synthetic', 'external'].includes(input.mode)) throw new ReviewPolicyFailure('invalid-policy');
    const reviewer = identities.get(input.reviewerProviderId);
    if (!reviewer) throw new ReviewPolicyFailure('unknown-provider');
    if (input.mode === 'external' && reviewer.execution === 'fixture') throw new ReviewPolicyFailure('synthetic-provider');
    if (input.mode === 'synthetic' && reviewer.execution !== 'fixture') throw new ReviewPolicyFailure('external-provider');
    let coding: {upstream: string; execution: 'fixture' | 'external'} | undefined;
    if (input.coding !== null) {
      const provenance = input.coding;
      if (!provenance || !identifier(provenance.providerId) || typeof provenance.model !== 'string' || !provenance.model.trim() || provenance.model.length > 256 || !sha(provenance.headSha) || typeof provenance.evidenceDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(provenance.evidenceDigest)) throw new ReviewPolicyFailure('missing-provenance');
      if (provenance.headSha !== input.headSha) throw new ReviewPolicyFailure('wrong-subject');
      coding = identities.get(provenance.providerId);
      if (!coding) throw new ReviewPolicyFailure('unknown-provider');
      if (input.mode === 'external' && coding.execution === 'fixture') throw new ReviewPolicyFailure('synthetic-provider');
    }
    if (input.differentProvider) {
      if (!coding) throw new ReviewPolicyFailure('missing-provenance');
      if (coding.upstream === reviewer.upstream) throw new ReviewPolicyFailure('same-upstream');
    }
    return Object.freeze({
      mode: input.mode,
      differentProvider: input.differentProvider,
      outcome: input.differentProvider ? 'distinct-upstreams' as const : 'not-required' as const,
      reviewerUpstream: reviewer.upstream,
      codingUpstream: coding?.upstream ?? null,
      provenanceDigest: input.coding?.evidenceDigest ?? null,
    });
  };
}
