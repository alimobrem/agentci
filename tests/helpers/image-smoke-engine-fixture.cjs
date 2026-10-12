// Subprocess transport fixture. It never starts containers or authenticates credentials.
const fs=require('node:fs'),path=require('node:path');
const root=path.dirname(process.argv[1]),file=path.join(root,'engine-state.json'),state=JSON.parse(fs.readFileSync(file)),args=process.argv.slice(2);
state.calls.push(args);state.inheritedControllerToken ||= Boolean(process.env.GITHUB_TOKEN);
const value=key=>args[args.indexOf(key)+1],name=args.at(-1),label=value('--label'),labels=()=>Object.fromEntries(args.flatMap((arg,index)=>arg==='--label'?[args[index+1].split('=')]:[]));
const save=()=>fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});
const output=text=>{save();if(text)console.log(text);};
const fail=()=>{save();console.error(state.secrets[0]??'synthetic-engine-diagnostic');process.exit(3);};
if(args[0]==='create'){
 const id=value('--name');state.container[id]={name:'/'+id,labels:labels()};
 if(args.includes('--env-file')){const envFile=value('--env-file'),info=fs.statSync(envFile);state.envModes.push(info.mode&0o777);for(const line of fs.readFileSync(envFile,'utf8').trim().split('\n')){const key=line.slice(0,line.indexOf('=')),entry=line.slice(line.indexOf('=')+1);if(/SECRET|TOKEN|PASSWORD|DATABASE_URL/.test(key))state.secrets.push(entry);}}
 if(state.failure==='lost-create'&&id.endsWith('-db'))fail();output(id);
}else if(args[0]==='ps')output(Object.keys(state.container).join('\n'));
else if(args[0]==='inspect'){
 const format=value('--format');if(format.includes('.HostConfig.Tmpfs'))output(JSON.stringify({mounts:state.failure==='storage-volume'?[{Type:'volume',Destination:'/var/lib/postgresql'}]:[],tmpfs:{'/var/lib/postgresql':'rw,nosuid,nodev,size=512m'}}));else if(format.includes('.Config.Labels'))output(JSON.stringify(state.container[name]));else if(format.includes('.State.ExitCode'))output('0');else output('sha256:'+'d'.repeat(64));
}else if(args[0]==='rm'){
 if(state.failure==='teardown')fail();delete state.container[name];if(state.failure==='late-cancel')process.kill(process.ppid,'SIGTERM');output('');
}else if(['network','volume'].includes(args[0])){
 const kind=args[0];if(args[1]==='create'){state[kind][name]={name,labels:labels()};output(name);}else if(args[1]==='ls')output(Object.keys(state[kind]).join('\n'));else if(args[1]==='inspect')output(JSON.stringify(state[kind][name]));else if(args[1]==='rm'){delete state[kind][name];output('');}else fail();
}else if(args[0]==='image')output('sha256:'+'e'.repeat(64));
else if(args[0]==='logs')output("state: 'RUNNING'");
else if(args[0]==='start'){
 if(state.failure==='service-start'&&name.endsWith('-api'))fail();output(name);
}else if(['stop','restart','cp'].includes(args[0]))output('');
else if(args[0]==='exec'){
 if(args.includes('stat'))output('tmpfs');
 else if(args.includes('psql'))output(args.includes('SELECT 1')?'1':'');
 else if(args.includes('temporal'))output('SERVING');
 else if(args.includes('test'))output('');
 else if(args.at(-1).includes('/readyz'))output('ready');
 else if(args.at(-1).includes('comparison-read'))output('comparison-read');
 else output('[200,401,401,202,"ignored",401,400,404]');
}else fail();
