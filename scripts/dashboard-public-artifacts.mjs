import {publishDashboardArtifacts} from './lib/dashboard-public-artifacts.mjs';
const result=await publishDashboardArtifacts('.agentci/artifacts/dashboard-native-staging','.agentci/artifacts/dashboard-native-public',{recovery:'.agentci/artifacts/image-smoke-cleanup.json'});
console.log(JSON.stringify(result));if(result.result!=='published')process.exitCode=1;
