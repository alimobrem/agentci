export const gateIds = ['scope', 'correctness', 'api', 'evals', 'reproducibility', 'runtime', 'safety', 'documentation', 'release-identity', 'publication', 'distribution', 'demo', 'closure', 'live-dogfood', 'api-image', 'worker-image'] as const;
export interface Proof { kind: 'file' | 'url'; value: string; sourceCommit: string; sha256?: string }
export interface Gate { id: string; status: 'pending' | 'passed' | 'failed' | 'inapplicable'; reason?: string; evidence: Proof[] }
export const customerGateIds = ['customer-onboarding', 'agent-api'] as const;
export interface Release { milestone: string; version: string; sourceCommit: string | null; gates: Gate[]; customerAcceptance?: boolean }
export interface Task { id: string; title: string; requirementIds: string[]; status: 'not-started' | 'in-progress' | 'blocked' | 'done'; startedAt: string | null; completedAt: string | null; acceptance: { text: string; status: 'pending' | 'passed'; evidence: string[] }[]; blockedReason?: string }
export function releaseLedgerPath(milestone: string) {
  if (!/^M(?:[0-9]|10)$/.test(milestone)) throw new Error('Unknown specification milestone');
  return `releases/${milestone.toLowerCase()}-gates.json`;
}
export function validatePhaseCoverage(milestone: string, tasks: Task[], requirements: { id: string; text: string; source: { section: string }; implementation: { milestone: string } }[]) {
  releaseLedgerPath(milestone);
  const required = requirements.filter(r => r.source.section === '40' && r.implementation.milestone === milestone && r.text.trim().startsWith('- '));
  if (!required.length) throw new Error('No milestone build/exit requirements');
  for (const requirement of required) if (!tasks.some(t => t.requirementIds.includes(requirement.id))) throw new Error(`${milestone} build/exit requirement has no task: ${requirement.id}`);
}
export function safePath(path: string) { return !!path && !path.startsWith('/') && !path.split(/[\\/]/).includes('..') && !/[\x00-\x1f]/.test(path); }
export function validateTasks(tasks: Task[], requirementIds: Set<string>) {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (!task.id || ids.has(task.id)) throw new Error('Duplicate or missing task ID'); ids.add(task.id);
    if (!['not-started', 'in-progress', 'blocked', 'done'].includes(task.status) || !task.requirementIds.length || !task.acceptance.length) throw new Error(`Incomplete task ${task.id}`);
    for (const id of task.requirementIds) if (!requirementIds.has(id)) throw new Error(`Unknown requirement ${id}`);
    if (task.status === 'blocked' && !task.blockedReason) throw new Error(`Missing blocker for ${task.id}`);
    for (const acceptance of task.acceptance) if (!acceptance.text || !['pending', 'passed'].includes(acceptance.status) || acceptance.evidence.some(path => !safePath(path)) || (acceptance.status === 'passed' && !acceptance.evidence.length)) throw new Error(`Missing acceptance evidence for ${task.id}`);
    if (task.status === 'done' && (task.acceptance.some(a => a.status !== 'passed') || !task.completedAt)) throw new Error(`Task ${task.id} has not passed acceptance`);
    for (const value of [task.startedAt, task.completedAt]) if (value && !Number.isFinite(Date.parse(value))) throw new Error(`Invalid task timestamp ${task.id}`);
    if (task.startedAt && task.completedAt && Date.parse(task.completedAt) < Date.parse(task.startedAt)) throw new Error(`Reversed timestamps ${task.id}`);
  }
}
export function validateRelease(record: Release, requireComplete = false) {
  releaseLedgerPath(record.milestone);
  if (!new RegExp(`^\\d+\\.\\d+\\.\\d+-${record.milestone.toLowerCase()}$`).test(record.version)) throw new Error('Version does not identify this milestone');
  if (record.sourceCommit !== null && !/^[a-f0-9]{40}$/.test(record.sourceCommit)) throw new Error('Release requires full source SHA');
  const requiredGates: readonly string[] = record.customerAcceptance ? [...gateIds, ...customerGateIds] : gateIds;
  if (new Set(record.gates.map(g => g.id)).size !== record.gates.length || requiredGates.some(id => !record.gates.some(g => g.id === id)) || record.gates.some(g => !requiredGates.includes(g.id))) throw new Error('Release gate set is incomplete or duplicated');
  for (const gate of record.gates) {
    if (!['pending', 'passed', 'failed', 'inapplicable'].includes(gate.status)) throw new Error(`Invalid gate status ${gate.id}`);
    if (gate.status === 'inapplicable' && (!gate.reason || record.milestone === 'M1' || ['live-dogfood', 'api-image', 'worker-image', ...customerGateIds].includes(gate.id))) throw new Error(`Invalid scope exception ${gate.id}`);
    if (gate.status === 'passed' && (!record.sourceCommit || !gate.evidence.length)) throw new Error(`No release evidence for ${gate.id}`);
    for (const evidence of gate.evidence) {
      if (evidence.sourceCommit !== record.sourceCommit) throw new Error(`Evidence SHA mismatch for ${gate.id}`);
      if (evidence.kind === 'file' && (!safePath(evidence.value) || !/^[a-f0-9]{64}$/.test(evidence.sha256 ?? ''))) throw new Error(`Invalid file proof ${gate.id}`);
      if (evidence.kind === 'url' && !/^https:\/\//.test(evidence.value)) throw new Error(`Invalid URL proof ${gate.id}`);
      if (!['file', 'url'].includes(evidence.kind)) throw new Error(`Invalid proof type ${gate.id}`);
    }
  }
  const remaining = record.gates.filter(g => !['passed', 'inapplicable'].includes(g.status)).map(g => g.id);
  if (requireComplete && remaining.length) throw new Error(`Milestone incomplete: ${remaining.join(', ')}`);
  return remaining;
}
export function median(values: number[]) { const sorted = [...values].sort((a,b) => a-b), i = Math.floor(sorted.length / 2); return sorted.length ? sorted.length % 2 ? sorted[i]! : (sorted[i-1]! + sorted[i]!) / 2 : null; }
export function blockedSeconds(task: Task, events: { task: string; action: string; at: string }[], now = Date.now()) {
  if (!task.startedAt) return null;
  const start=Date.parse(task.startedAt), end=task.completedAt?Date.parse(task.completedAt):now;
  let blocked:number|null=null,total=0;
  for(const event of events.filter(e=>e.task===task.id)){
    const at=Date.parse(event.at);if(at<start||at>end)continue;
    if(event.action==='block')blocked??=at;
    if(['start','done','reopen'].includes(event.action)&&blocked!==null){total+=at-blocked;blocked=null;}
  }
  if(blocked!==null)total+=end-blocked;
  return total/1000;
}
