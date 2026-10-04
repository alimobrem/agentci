import { createHash } from 'node:crypto';
import { minimatch } from 'minimatch';
import { parseYaml } from '../project/index.ts';
import { validateDocument } from '../schemas/index.ts';
import type { Analysis, Category, Change, FieldChange, ReviewFinding, ReviewInput } from './types.ts';

export const digest = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const shaPattern = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
function safeYaml(text: string): unknown { try { return parseYaml(text); } catch { throw new Error('Invalid YAML document'); } }
const structured = (path: string, text: string): unknown => /\.json$/i.test(path) ? JSON.parse(text) : safeYaml(text);
export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? '<absent>';
};
const escapePointer = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');

function fields(before: unknown, after: unknown, pointer = ''): FieldChange[] {
  if (canonical(before) === canonical(after)) return [];
  if ((object(before) && object(after)) || (Array.isArray(before) && Array.isArray(after))) {
    const left = before as Record<string, unknown>, right = after as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap(key => fields(left[key], right[key], `${pointer}/${escapePointer(key)}`));
  }
  return [{ pointer, operation: before === undefined ? 'added' : after === undefined ? 'removed' : 'modified',
    ...(before === undefined ? {} : { beforeDigest: digest(canonical(before)) }), ...(after === undefined ? {} : { afterDigest: digest(canonical(after)) }) }];
}

function project(files: Record<string, string>): any {
  if (!files['agentci.yaml']) throw new Error('Missing agentci.yaml at a reviewed commit');
  const value = safeYaml(files['agentci.yaml']);
  if (!validateDocument('agent-project', value).valid) throw new Error('Invalid agentci.yaml at a reviewed commit');
  return value;
}
function selectors(config: any, section: string): string[] {
  const patterns: unknown = config.spec[section]?.include ?? config.spec.extensions?.['agentci.io/review']?.[section] ?? [];
  if (!Array.isArray(patterns) || patterns.length > 100 || patterns.some(p => typeof p !== 'string' || p.length > 256 || p.startsWith('!') || p.startsWith('/') || p.includes('\\') || p.split('/').includes('..'))) {
    throw new Error(`Unsafe ${section} selectors`);
  }
  return patterns;
}
const matches = (path: string, patterns: string[]) => patterns.some(pattern => minimatch(path, pattern, { dot: true, nonegate: true }));

function requirements(path: string, text: string): any[] {
  let value: unknown;
  if (/\.ya?ml$/i.test(path)) value = safeYaml(text);
  else if (/\.md$/i.test(path)) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    if (!match) return [];
    value = safeYaml(match[1]!);
    if (!object(value) || (!('id' in value) && !('requirements' in value))) return [];
  } else return [];
  const entries = Array.isArray(value) ? value : object(value) && 'requirements' in value ? value.requirements : [value];
  if (!Array.isArray(entries) || !entries.length || entries.some(entry => !validateDocument('requirement', entry).valid)) throw new Error(`Invalid explicit requirements in ${path}`);
  return entries;
}
function requirementMap(files: Record<string, string>, patterns: string[]): Map<string, { value: any; path: string }> {
  const result = new Map<string, { value: any; path: string }>();
  for (const path of Object.keys(files).sort()) if (matches(path, patterns)) for (const value of requirements(path, files[path]!)) {
    if (result.has(value.id)) throw new Error(`Duplicate requirement ID: ${value.id}`);
    result.set(value.id, { value, path });
  }
  return result;
}
export function requirementImpact(input:ReviewInput):{changed:string[];known:string[]} {
  const before=requirementMap(input.base.files,selectors(project(input.base.files),'specifications'));
  const after=requirementMap(input.head.files,selectors(project(input.head.files),'specifications'));
  const known=[...new Set([...before.keys(),...after.keys()])].sort();
  return {known,changed:known.filter(id=>canonical(before.get(id)?.value)!==canonical(after.get(id)?.value))};
}

/** Pure data analysis. No repository code, scripts, imports or evals are executed. */
export function analyze(input: ReviewInput): Analysis {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository) || !shaPattern.test(input.base.sha) || !shaPattern.test(input.head.sha)) throw new Error('Exact commit SHAs and owner/repository are required');
  for (const snapshot of [input.base, input.head]) {
    const names = Object.keys(snapshot.files);
    if (names.length > 10_000) throw new Error('Snapshot exceeds 10000 files');
    let bytes = 0;
    for (const path of names) {
      if (!path || /[\x00-\x1f\x7f]/.test(path) || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..') || typeof snapshot.files[path] !== 'string') throw new Error('Unsafe snapshot path or content');
      const size = Buffer.byteLength(snapshot.files[path]!); bytes += size;
      if (size > 2 * 1024 * 1024 || bytes > 32 * 1024 * 1024) throw new Error('Snapshot exceeds content limits');
    }
  }
  const baseConfig = project(input.base.files), headConfig = project(input.head.files);
  for (const [config, snapshot] of [[baseConfig, input.base], [headConfig, input.head]] as const) {
    if (!Object.keys(snapshot.files).some(path => matches(path, selectors(config, 'specifications')))) throw new Error('No specification files match the reviewed configuration');
  }
  const configured: [Category, string][] = [['specification', 'specifications'], ['source', 'implementation'], ['eval', 'evals'], ['policy', 'policies'], ['prompt', 'prompts'], ['tool', 'tools'], ['permission', 'permissions'], ['model', 'modelConfigs']];
  const patterns = new Map(configured.map(([category, section]) => [category, [...selectors(baseConfig, section), ...selectors(headConfig, section)]]));
  const changes: Change[] = [];
  for (const path of [...new Set([...Object.keys(input.base.files), ...Object.keys(input.head.files)])].sort()) {
    const before = input.base.files[path], after = input.head.files[path];
    if (before === after) continue;
    const categories = new Set<Category>();
    for (const [category, include] of patterns) if (matches(path, include)) categories.add(category);
    if (/(^|\/)(package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|go\.(mod|sum)|Cargo\.(toml|lock))$/.test(path)) categories.add('dependency');
    if (/(^|\/)(openapi|swagger)[^/]*\.(json|ya?ml)$/.test(path)) categories.add('api');
    if (/\.schema\.json$/.test(path)) categories.add('data-schema');
    if (/(^|\/)(Dockerfile[^/]*|compose[^/]*\.ya?ml)$/.test(path) || /^(\.github\/workflows|\.tekton|deploy)\//.test(path)) categories.add('deployment');
    let delta: FieldChange[] = [];
    if (/\.(json|ya?ml)$/i.test(path) && categories.size) {
      try { delta = fields(before === undefined ? undefined : structured(path, before), after === undefined ? undefined : structured(path, after)); }
      catch { throw new Error(`Malformed structured input: ${path}`); }
      if (delta.length > 5000) throw new Error(`Structured diff exceeds 5000 fields: ${path}`);
    }
    if (path === 'agentci.yaml') {
      categories.add('policy');
      if (delta.some(field => field.pointer === '/spec/models' || field.pointer.startsWith('/spec/models/'))) categories.add('model');
      if (delta.some(field => field.pointer.includes('/agentci.io~1review/'))) categories.add('permission');
    }
    if (!categories.size) categories.add('source');
    changes.push({ path, operation: before === undefined ? 'added' : after === undefined ? 'removed' : 'modified', categories: [...categories].sort(), fields: delta,
      ...(before === undefined ? {} : { beforeDigest: digest(before) }), ...(after === undefined ? {} : { afterDigest: digest(after) }) });
  }
  const findings: ReviewFinding[] = [];
  const add = (rule: string, severity: ReviewFinding['severity'], claim: string, paths: string[], verification: ReviewFinding['verification'], requirementId?: string) => {
    findings.push({ id: digest(canonical({ rule, claim, paths, requirementId, head: input.head.sha })).slice(7, 31), rule, severity, claim, paths: [...new Set(paths)].sort(), verification, ...(requirementId ? { requirementId } : {}) });
  };
  const baseReqs = requirementMap(input.base.files, selectors(baseConfig, 'specifications'));
  const headReqs = requirementMap(input.head.files, selectors(headConfig, 'specifications'));
  for (const id of [...new Set([...baseReqs.keys(), ...headReqs.keys()])].sort()) {
    const before = baseReqs.get(id), after = headReqs.get(id);
    if (canonical(before?.value) === canonical(after?.value)) continue;
    for (const change of changes) if (change.path === before?.path || change.path === after?.path) if (!change.categories.includes('requirement')) change.categories.push('requirement');
    if (before?.value.status === 'active' && ['safety', 'security', 'human-approval'].includes(before.value.type)) {
      const removed = !after || after.value.status !== 'active';
      add('active-safety-requirement-change', 'high', removed ? 'Active safety/security requirement removed or deactivated.' : 'Active safety/security requirement changed; potential weakening needs review.', [before.path, ...(after ? [after.path] : [])], removed ? 'verified' : 'inferred', id);
    }
  }
  for (const change of changes) {
    if (change.categories.includes('model')) add('model-route-change', 'medium', 'Model/provider configuration changed.', [change.path], 'verified');
    if (change.categories.includes('policy') || change.categories.includes('permission')) add('policy-permission-change', 'high', 'Configured policy or permission input changed; access impact needs review.', [change.path], 'inferred');
    // Only explicitly configured manifest data supports confirmed permission claims.
    if (change.categories.includes('permission')) {
      const read = (text: string | undefined): any[] => {
        if (text === undefined) return [];
        const value = structured(change.path, text);
        if (!object(value) || value.kind !== 'PermissionManifest') return [];
        if (value.apiVersion !== 'agentci.io/v1alpha1' || !Array.isArray(value.permissions)) throw new Error(`Invalid permission manifest: ${change.path}`);
        const ids = new Set<string>();
        for (const item of value.permissions) {
          if (!object(item) || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !['production', 'non-production'].includes(item.environment) || !Array.isArray(item.actions) || !item.actions.length || item.actions.some((action: unknown) => !['read', 'write', 'delete', 'execute'].includes(action as string)) || !Array.isArray(item.resources) || !item.resources.length || item.resources.some((resource: unknown) => typeof resource !== 'string' || !resource)) throw new Error(`Invalid permission entry: ${change.path}`);
          ids.add(item.id);
        }
        return value.permissions;
      };
      const before = read(input.base.files[change.path]), after = read(input.head.files[change.path]);
      for (const permission of after) for (const action of permission.actions) for (const resource of permission.resources) {
        const existed = before.some(p => p.environment === permission.environment && p.actions.includes(action) && p.resources.includes(resource));
        if (!existed && permission.environment === 'production' && ['write', 'delete', 'execute'].includes(action)) add('production-mutation-added', 'high', `Explicit production ${action} permission added.`, [change.path], 'verified');
        if (!existed && action === 'read' && /(^|[.:/])secrets?(?:$|[.:/])/.test(resource)) add('secret-read-added', 'high', 'Explicit secret-reading permission added.', [change.path], 'verified');
      }
    }
  }
  const unique = [...new Map(findings.map(finding => [finding.id, finding])).values()];
  const risk = unique.some(f => f.severity === 'critical') ? 'critical' : unique.some(f => f.severity === 'high') ? 'high' : unique.some(f => f.severity === 'medium') ? 'medium' : 'low';
  return { schemaVersion: 'v1alpha1', repository: input.repository, baseSha: input.base.sha, headSha: input.head.sha, changes, findings: unique, risk, advisory: true, evals: { status: 'not-applicable', reason: 'Behavioral eval execution starts in M2; this analysis verifies deterministic repository changes only.' } };
}
