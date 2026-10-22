import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {lstat,realpath,writeFile} from 'node:fs/promises';
import {isAbsolute,resolve,join} from 'node:path';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>{throw Error('Optional Python engine provenance mismatch');};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(Object.keys(value).sort())!==JSON.stringify([...keys].sort()))fail();};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const approved={aiohttp:{version:'3.14.4',count:160,set:'f8451093d626740a91a483f150d878ddf1b7802072d91126642c61d146d04058'},certifi:{version:'2026.10.19',count:1,set:'7f3bd9e51e8b3e9329767a1bed69008e443ca68c3349e0559f4bcb9da2b63cf0'}};
async function artifactDirectory(path,root){
 if(typeof path!=='string'||!isAbsolute(path)||path!==resolve(root,'.agentci/artifacts/eval-engines-native')||await realpath(path)!==path)fail();
 const metadata=await lstat(path);if(!metadata.isDirectory()||metadata.isSymbolicLink()||metadata.mode&0o022||process.getuid&&metadata.uid!==process.getuid())fail();return path;
}

/** Trusted test-only inputs are validated before the first engine command. */
export async function pythonEngineTestContext(environment=process.env,{root=process.cwd()}={}){
 const unit=environment.AGENTCI_TEST_ENGINES_UNIT_ID,lease=environment.AGENTCI_TEST_ENGINES_LEASE_TOKEN,smoke=environment.AGENTCI_TEST_ENGINES_SMOKE_OWNER,artifact=environment.AGENTCI_TEST_ENGINES_ARTIFACT_ROOT;
 const uuid=value=>typeof value==='string'&&value.length===36&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
 if((unit!==undefined||lease!==undefined)&&(!uuid(unit)||!uuid(lease)))fail();
 if(smoke!==undefined&&(typeof smoke!=='string'||smoke.length!==30||!/^agentci-smoke-[a-f0-9]{16}$/.test(smoke)))fail();
 const artifactRoot=artifact===undefined?null:await artifactDirectory(artifact,root);
 return {ownership:{unitId:unit??randomUUID(),leaseToken:lease??randomUUID()},smokeOwner:smoke??'agentci-smoke-'+randomBytes(8).toString('hex'),artifactRoot};
}

export async function retainPythonEngineProvenance(record,components,requirements,{artifactRoot,root=process.cwd()}={}){
 validatePythonEngineProvenance(record,components,requirements);if(artifactRoot===null||artifactRoot===undefined)return false;
 const directory=await artifactDirectory(artifactRoot,root),bytes=Buffer.from(JSON.stringify(record,null,2)+'\n');if(bytes.length>65536)fail();
 await writeFile(join(directory,'python-installed-provenance.json'),bytes,{flag:'wx',mode:0o644});return true;
}

/** Parse the hash-only, wheel-only input. This is static provenance, not an install. */
export function pythonEngineRequirements(text,components){
 if(typeof text!=='string'||text.length>256*1024||components?.schemaVersion!==1||components.kind!=='optional-python-engine-security-pins'||components.requirements?.totalDependencies!==61||components.requirements.unchangedDependencies!==59||components.requirements.path!=='deploy/engines/deepeval/requirements.txt'||components.requirements.sha256!==hash(text)||!Array.isArray(components.packages)||components.packages.length!==2)fail();
 const lines=text.split('\n'),packages=[];
 for(const line of lines){if(!line||line.startsWith('#'))continue;const match=/^([A-Za-z][A-Za-z0-9_-]*)==([0-9][a-zA-Z0-9.+-]*) ((?:--hash=sha256:[a-f0-9]{64})(?: --hash=sha256:[a-f0-9]{64})*)$/.exec(line);if(!match||packages.some(p=>p.name.toLowerCase().replaceAll('_','-')===match[1].toLowerCase().replaceAll('_','-')))fail();const hashes=match[3].split(' ').map(h=>h.slice(14));if(new Set(hashes).size!==hashes.length||!equal(hashes,[...hashes].sort()))fail();packages.push({name:match[1],version:match[2],hashes,line});}
 if(packages.length!==61)fail();
 const other=packages.filter(p=>!Object.hasOwn(approved,p.name));if(other.length!==59||hash(other.map(p=>p.line).join('\n')+'\n')!==components.requirements.unchangedDependencyLinesSha256)fail();
 for(const [name,expected]of Object.entries(approved)){const record=components.packages.find(p=>p.name===name),pin=packages.find(p=>p.name===name);if(!record||!pin||record.version!==expected.version||pin.version!==expected.version||record.wheelHashes.length!==expected.count||hash(record.wheelHashes.join('\n')+'\n')!==expected.set||record.wheelHashesSha256!==expected.set||!equal(pin.hashes,record.wheelHashes)||!record.wheelHashes.every(digest))fail();}
 return packages.map(({name,version})=>({name,version})).sort((a,b)=>a.name.localeCompare(b.name));
}

function selectedFiles(components,arch){
 const aiohttp=components.packages.find(p=>p.name==='aiohttp').selectedWheelStaticProof.find(w=>w.platform==='linux/'+arch),certifi=components.packages.find(p=>p.name==='certifi').selectedWheelStaticProof.find(w=>w.platform==='any');
 if(!aiohttp||!certifi||aiohttp.nativeExtensions.length!==4||certifi.nativeExtensions.length!==0)fail();
 const files=[...aiohttp.nativeExtensions,...aiohttp.licenses,...aiohttp.metadata,...certifi.licenses,...certifi.metadata,{path:'certifi/cacert.pem',bytes:components.certifiTrust.current.bundleBytes,sha256:components.certifiTrust.current.bundleSha256}].map(({path,bytes,sha256,machine})=>({path,bytes,sha256,machine:machine??null})).sort((a,b)=>a.path.localeCompare(b.path));
 if(files.length!==12||new Set(files.map(f=>f.path)).size!==files.length||files.some(f=>typeof f.path!=='string'||!/^(?:aiohttp(?:-3\.14\.4\.dist-info)?|certifi(?:-2026\.10\.19\.dist-info)?)\/[a-zA-Z0-9_./-]+$/.test(f.path)||f.path.split('/').includes('..')||!Number.isSafeInteger(f.bytes)||f.bytes<=0||!digest(f.sha256)||f.machine!==null&&f.machine!==(arch==='amd64'?62:183)))fail();
 return files;
}

/** Stdlib inspection plus existing installed packaging metadata; no network or trust mutation. */
export function pythonEngineProbe(components,requirements){
 const packages=pythonEngineRequirements(requirements,components),files=Object.fromEntries(['amd64','arm64'].map(arch=>[arch,selectedFiles(components,arch)]));
 const expected={packages,files,requirementsSha256:components.requirements.sha256,removed:components.certifiTrust.removed.map(r=>r.derSha256)};
 return `import base64, hashlib, importlib, importlib.metadata, json, os, pathlib, platform, re, ssl, struct, sys, sysconfig
from packaging.markers import default_environment
from packaging.requirements import Requirement
expected=json.loads(${JSON.stringify(JSON.stringify(expected))})
machine=platform.machine()
arch={'x86_64':'amd64','aarch64':'arm64'}.get(machine)
assert arch in expected['files'], 'Unsupported optional Python architecture'
site=pathlib.Path(sysconfig.get_path('purelib'))
assert str(site)=='/opt/python/lib/python3.14/site-packages', 'Unexpected optional Python installation'
observed=[]
for item in expected['files'][arch]:
 path=site.joinpath(item['path'])
 assert path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(site) and path.stat().st_size==item['bytes'], 'Unsafe installed package member'
 data=path.read_bytes()
 elf=None
 if item['machine'] is not None:
  assert data[:6]==b'\\x7fELF\\x02\\x01', 'Unexpected native extension format'
  elf=struct.unpack_from('<H',data,18)[0]
 observed.append({'path':item['path'],'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'machine':elf})
versions=[{'name':p['name'],'version':importlib.metadata.version(p['name'])} for p in expected['packages']]
environment=default_environment()
environment['extra']=''
checked=0
unmet=0
for package in importlib.metadata.distributions():
 for value in package.requires or []:
  requirement=Requirement(value)
  if requirement.marker is not None and not requirement.marker.evaluate(environment): continue
  checked+=1
  try: installed=importlib.metadata.version(requirement.name)
  except importlib.metadata.PackageNotFoundError: unmet+=1; continue
  if requirement.specifier and not requirement.specifier.contains(installed,prereleases=True): unmet+=1
imports=[]
for item in expected['files'][arch]:
 if item['machine'] is None: continue
 name=item['path'].split('.cpython-314-')[0].replace('/','.')
 module=importlib.import_module(name)
 imports.append({'name':name,'path':str(pathlib.Path(module.__file__).resolve().relative_to(site))})
from aiohttp import http_parser
from aiohttp._http_parser import HttpRequestParser
c_parser=http_parser.HttpRequestParser is HttpRequestParser
bundle=site.joinpath('certifi/cacert.pem').read_bytes().decode('ascii')
certificates=re.findall(r'-----BEGIN CERTIFICATE-----\\s+([A-Za-z0-9+/=\\s]+?)-----END CERTIFICATE-----',bundle)
fingerprints=[hashlib.sha256(base64.b64decode(value,validate=False)).hexdigest() for value in certificates]
assert len(fingerprints)==len(set(fingerprints)), 'Duplicate certifi anchor'
record={'schemaVersion':1,'kind':'installed-optional-python-provenance','requirementsSha256':expected['requirementsSha256'],'pythonVersion':platform.python_version(),'implementation':sys.implementation.name,'abi':'cp'+str(sys.version_info.major)+str(sys.version_info.minor),'freeThreaded':bool(sysconfig.get_config_var('Py_GIL_DISABLED')),'platform':'linux/'+arch,'uid':os.getuid(),'packages':versions,'dependencyClosure':{'method':'installed-default-marker-requirements','checkedRequirements':checked,'unmet':unmet},'files':observed,'importedExtensions':imports,'defaultCParserSelected':c_parser,'certifiAnchors':len(fingerprints),'removedAnchorsPresent':sorted(set(expected['removed']).intersection(fingerprints))}
pathlib.Path('python-provenance.json').write_text(json.dumps(record,sort_keys=True)+'\\n')
`;
}

export function validatePythonEngineProvenance(record,components,requirements){
 const packages=pythonEngineRequirements(requirements,components);
 exact(record,['schemaVersion','kind','requirementsSha256','pythonVersion','implementation','abi','freeThreaded','platform','uid','packages','dependencyClosure','files','importedExtensions','defaultCParserSelected','certifiAnchors','removedAnchorsPresent']);
 if(record.schemaVersion!==1||record.kind!=='installed-optional-python-provenance'||record.requirementsSha256!==components.requirements.sha256||record.pythonVersion!=='3.14.8'||record.implementation!=='cpython'||record.abi!=='cp314'||record.freeThreaded!==false||!['linux/amd64','linux/arm64'].includes(record.platform)||record.uid!==1001||!equal(record.packages,packages))fail();
 const files=selectedFiles(components,record.platform.slice(6));if(!Array.isArray(record.files)||record.files.length!==files.length)fail();
 for(let i=0;i<files.length;i++){const item=record.files[i];exact(item,['path','bytes','sha256','machine']);if(!Object.entries(files[i]).every(([key,value])=>item[key]===value))fail();}
 const imported=files.filter(f=>f.machine!==null).map(f=>({name:f.path.split('.cpython-314-')[0].replaceAll('/','.'),path:f.path}));
 if(!equal(record.importedExtensions,imported)||record.defaultCParserSelected!==true||record.certifiAnchors!==120||!equal(record.removedAnchorsPresent,[]))fail();
 exact(record.dependencyClosure,['method','checkedRequirements','unmet']);if(record.dependencyClosure.method!=='installed-default-marker-requirements'||!Number.isSafeInteger(record.dependencyClosure.checkedRequirements)||record.dependencyClosure.checkedRequirements<1||record.dependencyClosure.checkedRequirements>10000||record.dependencyClosure.unmet!==0)fail();
 return record;
}
