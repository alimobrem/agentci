import {Pool} from 'pg';
import {loadSmokeConfig,readPrivateText,SmokeConfigError} from '../../packages/providers/smoke-config.ts';
import {PostgresBudgetLedger} from '../../packages/providers/budget.ts';
import {createOpenAIProvider} from '../../packages/providers/openai.ts';
import {openAILunaProfile} from '../../packages/providers/openai-profiles.ts';
import {createAnthropicProvider} from '../../packages/providers/anthropic.ts';
import {anthropicOpusProfile} from '../../packages/providers/anthropic-profiles.ts';
import {appendAnthropicToolResults} from '../../packages/providers/anthropic-continuation.ts';
import {createXAIProvider} from '../../packages/providers/xai.ts';
import {xAIGrokProfile} from '../../packages/providers/xai-profiles.ts';
import {appendXAIToolResults} from '../../packages/providers/xai-continuation.ts';
import {runProviderSmoke} from '../../packages/providers/conformance.ts';
import {ProviderFailure} from '../../packages/providers/types.ts';
let pool:Pool|undefined;
const controller=new AbortController(),cancel=()=>controller.abort();
process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
try{
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--config')throw new SmokeConfigError();
 const config=await loadSmokeConfig(args[1]!);
 const key=await readPrivateText(config.credentialFile),connectionString=await readPrivateText(config.databaseUrlFile);
 const profile=config.provider==='openai'?openAILunaProfile():config.provider==='anthropic'?anthropicOpusProfile():xAIGrokProfile();
 const provider=config.provider==='openai'?createOpenAIProvider(key,[profile]):config.provider==='anthropic'?createAnthropicProvider(key,[profile]):createXAIProvider(key,[profile]);
 pool=new Pool({connectionString,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,query_timeout:15000});
 pool.on('error',cancel);
 const ledger=new PostgresBudgetLedger(pool,config.budget);
 const records=await runProviderSmoke(provider,profile.model,ledger,controller.signal,config.provider==='anthropic'?{appendToolResults:appendAnthropicToolResults}:config.provider==='xai'?{appendToolResults:appendXAIToolResults}:{});
 process.stdout.write(JSON.stringify({passed:true,provider:provider.id,budgetId:config.budget.id,pricingRevision:profile.pricingRevision,records})+'\n');
}catch(error){
 const code=error instanceof SmokeConfigError?error.message:error instanceof ProviderFailure?error.code:'smoke-infrastructure-failure';
 process.stderr.write(JSON.stringify({passed:false,code})+'\n');process.exitCode=error instanceof SmokeConfigError?2:1;
}finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);await pool?.end();}
