import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {containerEngine,type ContainerEngine} from '../../packages/evals/runner.ts';
/** Validate the fixed operator client before connecting to any executor services. */
export async function requireContainerClient(value:ContainerEngine):Promise<void>{
  const engine=containerEngine(value);
  try{await promisify(execFile)(engine,['--version'],{timeout:10000,maxBuffer:1024});}
  catch{throw new Error('Configured container engine client is unavailable');}
}
