import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const repository=resolve(fileURLToPath(new URL('..',import.meta.url))),script=join(repository,'scripts/reproduction-client-package-smoke.mjs');
const excluded=['AGENTCI_TEST_DATABASE_URL','AGENTCI_TEST_TEMPORAL_ADDRESS','GITHUB_TOKEN','NODE_OPTIONS','npm_config_ignore_scripts','npm_config_userconfig','npm_config_globalconfig','npm_config_cache'];
const inherited={AGENTCI_TEST_DATABASE_URL:'synthetic-database-context',AGENTCI_TEST_TEMPORAL_ADDRESS:'synthetic-temporal-context',GITHUB_TOKEN:'synthetic-token-context',NODE_OPTIONS:'--conditions=synthetic-reproduction-context',npm_config_ignore_scripts:'true',npm_config_userconfig:'/synthetic-user-config-must-not-be-read',npm_config_globalconfig:'/synthetic-global-config-must-not-be-read',npm_config_cache:'/synthetic-cache-must-not-be-used'};

async function fixture({failInstall=false}={}){
 const root=await mkdtemp(join(tmpdir(),'reproduction-package-environment-')),bin=join(root,'bin'),npmReceipt=join(root,'npm.json'),cliReceipt=join(root,'cli.json'),integrationDirectory=join(root,'integration-receipts');
 await mkdir(bin);await mkdir(integrationDirectory);await mkdir(join(root,'tests/integration'),{recursive:true});await mkdir(join(root,'node_modules'));
 await symlink(join(repository,'node_modules/tsx'),join(root,'node_modules/tsx'));
 const version=JSON.parse(await readFile(join(repository,'package.json'),'utf8')).version;
 const archive=join(root,'synthetic-package.tgz');await writeFile(archive,'Synthetic fixture; fake npm must not access a registry.\n');
 const cli=`import {writeFileSync} from 'node:fs';const excluded=${JSON.stringify(Object.keys(inherited).filter(key=>!['npm_config_userconfig','npm_config_globalconfig','npm_config_cache'].includes(key)))};writeFileSync(${JSON.stringify(cliReceipt)},JSON.stringify({excludedAbsent:excluded.every(key=>!(key in process.env))}));console.log(${JSON.stringify(version)});\n`;
 const npm=`#!/usr/bin/env node
import {mkdirSync,writeFileSync,readFileSync,lstatSync,realpathSync} from 'node:fs';import {join} from 'node:path';
const args=process.argv.slice(2),prefix=args[args.indexOf('--prefix')+1],inherited=${JSON.stringify(inherited)},excluded=${JSON.stringify(excluded)};
const replaced=['npm_config_userconfig','npm_config_globalconfig','npm_config_cache'];
const receipt={prefix,cwdOwnedRoot:process.cwd()===realpathSync(prefix),archiveMatches:args.at(-1)===${JSON.stringify(archive)},flagsUnchanged:['install','--offline','--omit=dev','--no-audit','--no-fund','--prefix'].every(value=>args.includes(value)),keys:Object.keys(process.env).sort(),excludedAbsent:excluded.filter(key=>!replaced.includes(key)).every(key=>!(key in process.env)),configPathsReplaced:replaced.every(key=>process.env[key]!==inherited[key]),configOwnedRoot:process.env.npm_config_userconfig===join(prefix,'empty.npmrc')&&process.env.npm_config_globalconfig===join(prefix,'empty-global.npmrc')&&process.env.npm_config_cache===join(prefix,'cache'),publicRegistry:process.env.npm_config_registry==='https://registry.npmjs.org/',freshHome:process.env.HOME===prefix};
try{receipt.emptyUserConfig=readFileSync(process.env.npm_config_userconfig,'utf8')==='';receipt.emptyGlobalConfig=readFileSync(process.env.npm_config_globalconfig,'utf8')==='';receipt.projectNpmrcAbsent=!lstatSync(join(prefix,'.npmrc'),{throwIfNoEntry:false});}catch{receipt.emptyUserConfig=false;receipt.emptyGlobalConfig=false;}
writeFileSync(${JSON.stringify(npmReceipt)},JSON.stringify(receipt));
if(!receipt.excludedAbsent||!receipt.configPathsReplaced||!receipt.configOwnedRoot||!receipt.emptyUserConfig||!receipt.emptyGlobalConfig||!receipt.freshHome||!receipt.projectNpmrcAbsent)process.exit(91);
mkdirSync(process.env.npm_config_cache,{recursive:true});
if(${JSON.stringify(failInstall)})process.exit(73);
mkdirSync(join(prefix,'node_modules/agentci/dist/cmd/agentci'),{recursive:true});writeFileSync(join(prefix,'node_modules/agentci/package.json'),JSON.stringify({name:'agentci',version:${JSON.stringify(version)}}));writeFileSync(join(prefix,'node_modules/agentci/dist/cmd/agentci/main.js'),${JSON.stringify(cli)});
`;
 await writeFile(join(bin,'npm'),npm,{mode:0o700});
 const suites=['model-reproduction-client','reproduction-admission-http','finding-disposition-http','model-review-check-links'];
 for(const suite of suites){
  const probe=`import test from 'node:test';import assert from 'node:assert/strict';import {writeFileSync,lstatSync} from 'node:fs';const expected=${JSON.stringify(inherited)};test('source integration context retained',()=>{for(const [key,value]of Object.entries(expected))assert.equal(process.env[key],value);assert.ok(lstatSync(process.env.AGENTCI_TEST_CLIENT_PACKAGE_ROOT+'/package.json').isFile());writeFileSync(${JSON.stringify(join(integrationDirectory,suite+'.json'))},JSON.stringify({sourceContextRetained:true,installedRootProvided:true}));});\n`;
  await writeFile(join(root,'tests/integration',suite+'.test.ts'),probe);
 }
 const run=()=>execFileSync(process.execPath,[script,archive,'--offline'],{cwd:root,env:{PATH:bin+':'+process.env.PATH,...inherited},encoding:'utf8',stdio:'pipe',timeout:15000});
 return {root,npmReceipt,cliReceipt,integrationDirectory,suites,run};
}

test('reproduction package npm and CLI exclude inherited private context while source integration retains it',async()=>{
 const f=await fixture();
 try{
  f.run();const npm=JSON.parse(await readFile(f.npmReceipt,'utf8'));
  assert.equal(npm.excludedAbsent,true);assert.equal(npm.configPathsReplaced,true);assert.equal(npm.configOwnedRoot,true);assert.equal(npm.publicRegistry,true);assert.equal(npm.emptyUserConfig,true);assert.equal(npm.emptyGlobalConfig,true);assert.equal(npm.projectNpmrcAbsent,true);assert.equal(npm.freshHome,true);assert.equal(npm.cwdOwnedRoot,true);assert.equal(npm.archiveMatches,true);assert.equal(npm.flagsUnchanged,true);
  // macOS may add this CoreFoundation value after exec; it is not forwarded context.
  assert.deepEqual(npm.keys.filter((key:string)=>!(process.platform==='darwin'&&key==='__CF_USER_TEXT_ENCODING')),['HOME','PATH','npm_config_cache','npm_config_globalconfig','npm_config_registry','npm_config_userconfig'].sort());
  assert.equal(JSON.parse(await readFile(f.cliReceipt,'utf8')).excludedAbsent,true);
  for(const suite of f.suites)assert.deepEqual(JSON.parse(await readFile(join(f.integrationDirectory,suite+'.json'),'utf8')),{sourceContextRetained:true,installedRootProvided:true});
  await assert.rejects(lstat(npm.prefix),{code:'ENOENT'});
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('reproduction package failed install removes its owned npm home, cache and installation',async()=>{
 const f=await fixture({failInstall:true});
 try{
  assert.throws(f.run);const npm=JSON.parse(await readFile(f.npmReceipt,'utf8'));assert.equal(npm.excludedAbsent,true);assert.equal(npm.emptyUserConfig,true);await assert.rejects(lstat(npm.prefix),{code:'ENOENT'});await assert.rejects(lstat(f.cliReceipt),{code:'ENOENT'});
 }finally{await rm(f.root,{recursive:true,force:true});}
});
