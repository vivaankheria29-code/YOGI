import {CLI_PROVIDERS} from './cli-providers.mjs';
import {locateCLI} from './cli-providers.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),discoveryCache=new Map();
export async function openCodeModels(settings){
  const key=settings.executable||'PATH',cached=discoveryCache.get(key);if(cached&&Date.now()-cached.at<300000)return cached.models;
  const command=await locateCLI(settings);const {stdout}=await exec(command.command,[...command.args,'models'],{windowsHide:true,timeout:6000,maxBuffer:256000});
  const models=stdout.split(/\r?\n/).map(s=>s.trim()).filter(s=>/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._/:#-]+$/.test(s)).slice(0,500).map(id=>({id,label:id}));
  if(discoveryCache.size>=8)discoveryCache.delete(discoveryCache.keys().next().value);discoveryCache.set(key,{at:Date.now(),models});return models;
}
const choices={
  codex:[['gpt-6.1-sol','GPT-6.1-Sol'],['gpt-6-astra','GPT-6-Astra'],['gpt-6.1-terra','GPT-6.1 Terra'],['gpt-6-sol','GPT-6-Sol'],['gpt-6-luna','GPT-6-Luna']],
  claude:[['sonnet','Claude Sonnet · CLI alias'],['opus','Claude Opus · CLI alias'],['haiku','Claude Haiku · CLI alias']],
  antigravity:[['Orchestrator (Carbon)','Orchestrator (Carbon)'],['Orchestrator (Argon)','Orchestrator (Argon)'],['gemini-4-hydrogen-xhigh','Gemini 4 Hydrogen · Extra High']],
  gemini:[['auto','Auto · Gemini CLI'],['gemini-3-pro-preview','Gemini 3 Pro Preview'],['gemini-3-flash-preview','Gemini 3 Flash Preview'],['gemini-2.5-pro','Gemini 2.5 Pro'],['gemini-2.5-flash','Gemini 2.5 Flash']],
  qwen:[['qwen3-coder-plus','Qwen3 Coder Plus'],['qwen3-coder-flash','Qwen3 Coder Flash']],
};
export function modelOptions(providerId,{profiles=[],selected=null,live=null}={}){
  if(!CLI_PROVIDERS.some(p=>p.id===providerId))throw Object.assign(new Error('Unknown CLI provider.'),{status:400});
  const result=new Map(),add=(id,label)=>{if(typeof id==='string'&&id.length&&id.length<=160&&!id.startsWith('-')&&!(providerId==='antigravity'?/[\x00-\x1f\x7f]/:/[\x00-\x20]/).test(id)&&id!=='__custom__')result.set(id,{id,label:String(label||id).slice(0,200)});};
  if(providerId!=='amp'){
    for(const [id,label]of choices[providerId]||[])add(id,label);
    for(const m of live||[])add(m.model||m.id,m.displayName||m.label||m.model||m.id);
    for(const p of profiles)if(p.id===providerId&&p.model&&!result.has(p.model))add(p.model,p.model+' · saved connection');
    if(selected?.id===providerId&&selected.model&&!result.has(selected.model))add(selected.model,selected.model+' · saved model');
  }
  return {providerId,models:[...result.values()],source:live?.length?'cli':'suggestions',hint:providerId==='amp'?'Amp selects its model in Amp.':live?.length?'Includes models reported by your CLI; account access still applies.':'Model suggestions and saved connections. Availability depends on your CLI version, provider configuration and account.'};
}
