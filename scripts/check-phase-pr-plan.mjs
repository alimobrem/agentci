import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const plan = JSON.parse(readFileSync('delivery/phase-pr-plan.json', 'utf8'));
const inventory = parse(readFileSync('specs/requirements.yaml', 'utf8')).requirements;
const future = inventory.filter(r => /^M(?:[3-9]|10)$/.test(r.implementation.milestone));
const expected = new Map(future.map(r => [r.id, r]));
const prs = new Map();
const fail = message => { throw new Error(message); };
if (plan.state !== 'proposed-plan-not-implementation') fail('Plan must not claim implementation');
for (let number = 3; number <= 10; number++) {
  const phase = plan.phases.find(p => p.id === `M${number}`);
  if (!phase || !phase.exit || !phase.prs.length) fail(`Missing M${number} plan/exit`);
  for (const pr of phase.prs) {
    if (prs.has(pr.id) || !pr.id.startsWith(`${phase.id}-`)) fail(`Invalid/duplicate PR ${pr.id}`);
    if (!plan.sizes[pr.size] || !pr.acceptance || pr.status !== 'planned') fail(`Incomplete PR ${pr.id}`);
    const index = phase.prs.indexOf(pr);
    for (const dependency of pr.dependsOn) {
      if (dependency.endsWith(' closure')) {
        if (dependency !== `M${number - 1} closure` || index !== 0) fail(`Invalid phase boundary ${pr.id}`);
      } else if (!phase.prs.slice(0, index).some(p => p.id === dependency)) {
        fail(`Missing/forward dependency ${dependency} for ${pr.id}`);
      }
    }
    prs.set(pr.id, phase.id);
  }
}
const assigned = new Set();
for (const owner of plan.requirementOwners) {
  const requirement = expected.get(owner.requirementId);
  if (!requirement || assigned.has(owner.requirementId)) fail(`Unknown/duplicate owner ${owner.requirementId}`);
  if (owner.milestone !== requirement.implementation.milestone || prs.get(owner.primaryPr) !== owner.milestone) {
    fail(`Phase/PR mismatch ${owner.requirementId}`);
  }
  if (owner.sourceSection !== requirement.source.section) fail(`Source mismatch ${owner.requirementId}`);
  assigned.add(owner.requirementId);
}
const missing = [...expected.keys()].filter(id => !assigned.has(id));
if (missing.length) fail(`Unassigned requirements: ${missing.join(', ')}`);
console.log(`${plan.phases.length} phases, ${prs.size} planned PRs, ${assigned.size} inventory entries assigned; no implementation claims.`);
