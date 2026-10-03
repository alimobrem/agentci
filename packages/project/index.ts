import { glob, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parseDocument } from 'yaml';
import { validateDocument } from '../schemas/index.ts';

export interface Diagnostic { file: string; message: string }
export interface ProjectValidation { valid: boolean; files: number; requirements: number; errors: Diagnostic[] }

export function parseYaml(text: string): unknown {
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors.map(error => error.message).join('; '));
  return document.toJS({ maxAliasCount: 50 });
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Reads data files only. Never evaluates repository code or invokes eval commands. */
export async function validateProject(directory: string): Promise<ProjectValidation> {
  const errors: Diagnostic[] = [];
  let files = 0;
  let requirements = 0;
  const result = (): ProjectValidation => ({ valid: errors.length === 0, files, requirements, errors });
  const fail = (file: string, message: string) => errors.push({ file, message });
  let root: string;
  try { root = await realpath(directory); }
  catch { fail('agentci.yaml', 'Project directory does not exist'); return result(); }

  async function readLocal(file: string): Promise<string> {
    const actual = await realpath(resolve(root, file));
    if (!inside(root, actual)) throw new Error('File resolves outside the project root');
    const text = await readFile(actual, 'utf8');
    files++;
    return text;
  }

  let config: any;
  try {
    config = parseYaml(await readLocal('agentci.yaml'));
    const checked = validateDocument('agent-project', config);
    if (!checked.valid) {
      for (const error of checked.errors) fail('agentci.yaml', `${error.instancePath || '/'} ${error.message}`);
      return result();
    }
  } catch (error) {
    fail('agentci.yaml', error instanceof Error ? error.message : 'Cannot read configuration');
    return result();
  }

  // Validate selectors without letting globs escape the repository boundary.
  const sections = ['specifications', 'implementation', 'evals', 'policies', 'prompts'] as const;
  const selected: Record<string, string[]> = {};
  for (const section of sections) {
    const patterns = config.spec[section].include as string[];
    for (const pattern of patterns) {
      if (isAbsolute(pattern) || pattern.split(/[\\/]/).includes('..') || pattern.startsWith('!')) {
        fail('agentci.yaml', `Unsafe ${section} include pattern: ${pattern}`);
      }
    }
    if (errors.length) continue;
    selected[section] = [];
    for await (const file of glob(patterns, { cwd: root, exclude: ['node_modules/**', '.git/**'] })) {
      if ((await stat(resolve(root, file))).isFile()) selected[section]!.push(file);
    }
  }
  if (errors.length) return result();
  if (!selected.specifications?.length) fail('agentci.yaml', 'No specification files match the configured includes');

  const ids = new Set<string>();
  function checkRequirement(value: unknown, file: string) {
    const checked = validateDocument('requirement', value);
    if (!checked.valid) {
      for (const error of checked.errors) fail(file, `${error.instancePath || '/'} ${error.message}`);
      return;
    }
    const id = (value as { id: string }).id;
    if (ids.has(id)) fail(file, `Duplicate requirement ID: ${id}`);
    ids.add(id);
    requirements++;
  }

  for (const file of selected.specifications ?? []) {
    try {
      const text = await readLocal(file);
      if (/\.ya?ml$/i.test(file)) {
        const value = parseYaml(text);
        // Explicit YAML: a requirement, array of requirements, or { requirements: [...] }.
        const entries = Array.isArray(value) ? value :
          value && typeof value === 'object' && 'requirements' in value ? (value as any).requirements : [value];
        if (!Array.isArray(entries) || !entries.length) throw new Error('Expected one or more explicit requirements');
        for (const entry of entries) checkRequirement(entry, file);
      } else if (/\.md$/i.test(file)) {
        const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
        if (frontMatter) {
          const value: any = parseYaml(frontMatter[1]!);
          if (value && typeof value === 'object' && ('id' in value || 'requirements' in value)) {
            const entries = 'requirements' in value ? value.requirements : [value];
            if (!Array.isArray(entries) || !entries.length) throw new Error('Invalid requirements front matter');
            for (const entry of entries) checkRequirement(entry, file);
          }
        }
        // Ordinary prose is source documentation, never inferred as an accepted contract.
      }
    } catch (error) { fail(file, error instanceof Error ? error.message : 'Cannot read specification'); }
  }
  // M0 recognizes eval inputs but does not claim to validate the future M2 eval contract.
  for (const file of selected.evals ?? []) {
    try { parseYaml(await readLocal(file)); }
    catch (error) { fail(file, error instanceof Error ? error.message : 'Cannot parse eval configuration'); }
  }
  return result();
}
