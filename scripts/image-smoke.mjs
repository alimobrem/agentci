import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const prefix = `agentci-smoke-${randomUUID().slice(0, 8)}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 }).trim();
const containers = [], directory = await mkdtemp(join(tmpdir(), 'agentci-image-smoke-'));
const temporalVolume = `${prefix}-temporal-data`;
const roles = process.argv[2] ?? '0.2.1-m1';
const create = (name, ...args) => { containers.push(name); return docker('create', '--name', name, '--label', 'agentci.purpose=image-smoke', '--network', prefix, ...args); };
const pause = () => new Promise(resolve => setTimeout(resolve, 250));
async function wait(probe) { for (let i = 0; i < 80; i++) { try { if (probe()) return; } catch {} await pause(); } throw new Error('Service did not become ready'); }
try {
  docker('network', 'create', prefix);
  docker('volume', 'create', temporalVolume);
  const db = `${prefix}-db`, temporal = `${prefix}-temporal`;
  create(db, '--network-alias', 'postgres', '-e', 'POSTGRES_PASSWORD=local-smoke-only', '-e', 'POSTGRES_DB=agentci', 'postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873'); docker('start', db);
  await wait(() => docker('exec', '-e', 'PGPASSWORD=local-smoke-only', db, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'agentci', '-tAc', 'SELECT 1') === '1');
  execFileSync('docker', ['exec', '-i', db, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'agentci'], { input: await readFile(new URL('../deploy/migrations/001_m1.sql', import.meta.url)), stdio: ['pipe', 'pipe', 'pipe'] });
  create(temporal, '--network-alias', 'temporal', '-v', `${temporalVolume}:/home/temporal`, 'temporalio/temporal:latest@sha256:ad4c82c97bd12b417d1ea942610dbcd511afb250c4d5ed26c694009533df447e', 'server', 'start-dev', '--ip', '0.0.0.0', '--db-filename', '/home/temporal/temporal.db', '--headless'); docker('start', temporal);
  await wait(() => docker('exec', temporal, 'temporal', 'operator', 'cluster', 'health', '--address', '127.0.0.1:7233').includes('SERVING'));
  const keyPath = join(directory, 'fixture.pem');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const env = {
    AGENTCI_REPOSITORY: 'example/repo', AGENTCI_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000001',
    AGENTCI_PUBLIC_URL: 'http://localhost:3000', GITHUB_APP_ID: '1', GITHUB_INSTALLATION_ID: '12',
    GITHUB_PRIVATE_KEY_FILE: '/tmp/fixture.pem', GITHUB_WEBHOOK_SECRET: 's'.repeat(32), AGENTCI_EVIDENCE_TOKEN: 'e'.repeat(32),
    DATABASE_URL: 'postgresql://postgres:local-smoke-only@postgres:5432/agentci', TEMPORAL_ADDRESS: 'temporal:7233',
  };
  for (const role of ['api', 'worker']) {
    const name = `${prefix}-${role}`;
    create(name, '--user', `${process.getuid()}:${process.getgid()}`, ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]), `agentci-${role}:${roles}`);
    if (role === 'worker') docker('cp', '-a', keyPath, `${name}:/tmp/fixture.pem`);
    docker('start', name);
  }
  const api = `${prefix}-api`, worker = `${prefix}-worker`;
  const request = script => docker('exec', api, 'node', '--input-type=module', '-e', script);
  await wait(() => request("const r=await fetch('http://127.0.0.1:3000/readyz');if(!r.ok)process.exit(1);console.log('ready')") === 'ready');
  await wait(() => {
    const result = spawnSync('docker', ['logs', worker], { encoding: 'utf8' });
    const output = result.stdout + result.stderr;
    return output.includes("state: 'RUNNING'");
  });
  const statuses = JSON.parse(request(`
    import {createHmac,randomUUID} from 'node:crypto';
    const origin='http://127.0.0.1:3000';
    const health=await fetch(origin+'/healthz');
    const denied=await fetch(origin+'/v1/evidence/'+randomUUID());
    const invalid=await fetch(origin+'/v1/webhooks/github',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    const raw=JSON.stringify({action:'closed',number:1,installation:{id:12},repository:{full_name:'example/repo'},pull_request:{number:1,base:{sha:'a'.repeat(40),repo:{full_name:'example/repo'}},head:{sha:'b'.repeat(40)}}});
    const closed=await fetch(origin+'/v1/webhooks/github',{method:'POST',headers:{'content-type':'application/json','x-github-event':'pull_request','x-github-delivery':randomUUID(),'x-hub-signature-256':'sha256='+createHmac('sha256','s'.repeat(32)).update(raw).digest('hex')},body:raw});
    console.log(JSON.stringify([health.status,denied.status,invalid.status,closed.status,(await closed.json()).status]));
  `));
  if (JSON.stringify(statuses) !== '[200,401,401,202,"ignored"]') throw new Error(`Unexpected runtime responses: ${JSON.stringify(statuses)}`);
  docker('exec', temporal, 'test', '-s', '/home/temporal/temporal.db');
  docker('restart', '--time', '20', temporal);
  await wait(() => docker('exec', temporal, 'temporal', 'operator', 'cluster', 'health', '--address', '127.0.0.1:7233').includes('SERVING'));
  docker('exec', temporal, 'test', '-s', '/home/temporal/temporal.db');
  docker('stop', '--time', '20', api, worker);
  for (const name of [api, worker]) if (docker('inspect', '--format', '{{.State.ExitCode}}', name) !== '0') throw new Error(`Unclean shutdown: ${name}`);
  console.log(JSON.stringify({ result: 'passed', version: roles, platform: process.arch, checks: ['non-root API/worker startup', 'readiness', 'signature rejection', 'evidence authentication', 'signed closed delivery', 'non-root persistent Temporal database startup/restart', 'graceful shutdown'], github: 'synthetic credentials; no live GitHub review claimed' }, null, 2));
} catch (error) {
  for (const name of containers.filter(name => /-(api|worker)$/.test(name))) {
    try {
      const result = spawnSync('docker', ['logs', name], { encoding: 'utf8' });
      console.error(name, (result.stdout + result.stderr).slice(-2000));
    } catch (diagnostic) { console.error(name, diagnostic.stderr?.toString().slice(-2000)); }
  }
  throw error;
} finally {
  for (const name of containers.reverse()) { try { docker('rm', '-f', '-v', name); } catch {} }
  try { docker('network', 'rm', prefix); } catch {}
  try { docker('volume', 'rm', temporalVolume); } catch {}
  await rm(directory, { recursive: true, force: true });
}
