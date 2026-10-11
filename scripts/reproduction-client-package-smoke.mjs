import {mkdtemp,rm,readFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2),offline=args.includes('--offline');if(args.some(a=>a.startsWith('--')&&a!=='--offline')||args.filter(a=>!a.startsWith('--')).length>1)throw Error('Supply one package archive and optional --offline');
if(!process.env.AGENTCI_TEST_DATABASE_URL)throw Error('Installed reproduction client acceptance requires PostgreSQL; never silently skip');
const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version,archive=resolve(args.find(a=>!a.startsWith('--'))??`releases/agentci-${version}.tgz`),root=await mkdtemp(join(tmpdir(),'agentci-reproduction-package-'));
try{
 execFileSync('npm',['install',...(offline?['--offline']:[]),'--omit=dev','--no-audit','--no-fund','--prefix',root,archive],{stdio:'pipe'});
 const installed=join(root,'node_modules/agentci'),manifest=JSON.parse(await readFile(join(installed,'package.json'),'utf8'));if(manifest.name!=='agentci'||manifest.version!==version)throw Error('Installed package identity mismatch');
 try{await readFile(join(root,'node_modules/tsx/package.json'));throw Error('Development loader installed in production package');}catch(e){if(e.code!=='ENOENT')throw e;}
 const cli=join(installed,'dist/cmd/agentci/main.js');if(execFileSync(process.execPath,[cli,'--version'],{encoding:'utf8'}).trim()!==version)throw Error('Installed CLI version mismatch');
 execFileSync(process.execPath,['--import','tsx','--test',resolve('tests/integration/model-reproduction-client.test.ts'),resolve('tests/integration/reproduction-admission-http.test.ts'),resolve('tests/integration/finding-disposition-http.test.ts')],{env:{...process.env,AGENTCI_TEST_CLIENT_PACKAGE_ROOT:installed},stdio:'inherit',timeout:60000});
 console.log(JSON.stringify({acceptance:'production-installed-reproduction-client-cli',version,installation:'npm install --omit=dev',developmentLoaderInstalled:false,publicExport:'agentci/client',result:'passed',liveProviders:false}));
}finally{await rm(root,{recursive:true,force:true});}
