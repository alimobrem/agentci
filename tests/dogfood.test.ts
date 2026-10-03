import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactUrl, verifyExport } from '../packages/github/dogfood.ts';
import { reviewJob, evidenceFixture } from './fixtures/control.ts';
test('Hosted evidence links are restricted to GitHub artifacts in the configured repository', () => {
  const valid = 'https://github.com/example/repo/actions/runs/123/artifacts/456';
  assert.equal(artifactUrl(valid, 'example/repo'), valid);
  for (const value of [valid.replace('example/repo', 'other/repo'), valid.replace('github.com', 'evil.test'), `${valid}?token=secret`, `${valid}#fragment`, 'https://github.com/example/repo/actions/runs/123']) assert.throws(() => artifactUrl(value, 'example/repo'));
});
test('Hosted publication verifies PR, head, base, repository, installation and digest before publishing', () => {
  const record = evidenceFixture();
  verifyExport(reviewJob, record, reviewJob.repository, reviewJob.installationId);
  assert.throws(() => verifyExport({ ...reviewJob, headSha: 'c'.repeat(40) }, record, reviewJob.repository, reviewJob.installationId));
  assert.throws(() => verifyExport(reviewJob, record, 'other/repo', reviewJob.installationId));
  assert.throws(() => verifyExport(reviewJob, record, reviewJob.repository, 99));
  assert.throws(() => verifyExport(reviewJob, { ...record, digest: 'sha256:bad' }, reviewJob.repository, reviewJob.installationId));
  assert.throws(() => verifyExport({ ...reviewJob, pullRequest: 2 }, record, reviewJob.repository, reviewJob.installationId));
});
