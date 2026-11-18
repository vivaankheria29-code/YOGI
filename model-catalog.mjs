import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {parse as jsonc} from 'jsonc-parser';
import {parse as yaml} from 'yaml';
import {parse as toml} from 'smol-toml';
import {CLI_PROVIDERS,locateCLI,validateEngine} from './cli-providers.mjs';
import {CodexBridge} from './codex-bridge.mjs';
const exec=promisify(execFile);
const valid=(provider,id)=>typeof id==='string'&&id.length>0&&id.length<=160&&id!=='__custom__'&&!id.startsWith('-')&&!(provider==='antigravity'?/[\x00-\x1f\x7f]/:/[\x00-\x20\x7f]/).test(id);

export function modelOptions(providerId,{profiles=[],selected=null,live=[],configured=[],installed=null,warning=''}={}){
  if(!CLI_PROVIDERS.some(p=>p.id===providerId))throw Object.assign(new Error('Unknown CLI provider.'),{status:400});
  const result=new Map();
  const add=(entry,source)=>{const id=typeof entry==='string'?entry:entry?.model||entry?.id||entry?.value;if(valid(providerId,id)&&!result.has(id))result.set(id,{id,label:String(entry?.displayName||entry?.display_name||entry?.label||id).slice(0,200),source});};
  if(providerId!=='amp'){
    for(const entry of live||[])add(entry,'cli');
    for(const entry of configured)add(entry,'config');
    for(const p of profiles)if(p.id===providerId&&p.model)add(p.model,'saved');
    if(selected?.id===providerId&&selected.model)add(selected.model,'saved');
  }
  const sources=[...new Set([...result.values()].map(m=>m.source))];
  const hint=providerId==='amp'?'Amp manages model selection in Amp.':installed===false?'CLI not detected. Install it or set its executable path. Saved IDs remain available.':sources.includes('cli')?'Models reported by this CLI, plus configured and saved IDs. The CLI checks model access when used.':sources.includes('config')?'Models read from this CLI’s local configuration. This may be a partial list; the CLI checks access when used.':'This CLI did not expose a model list. Use its default or enter a custom model ID.';
  return {providerId,models:[...result.values()],installed,source:sources.includes('cli')?'cli':sources.includes('config')?'config':sources.includes('saved')?'saved':'unavailable',hint:hint+(warning?' '+warning:'')};
}

// Read known model fields only. Credentials, URLs and raw CLI diagnostics never leave this module.
export function configuredModels(id,{home=os.homedir(),cwd=process.cwd(),env=process.env}={}){
  const models=[],warnings=[];
  const add=value=>{if(valid(id,value))models.push({id:value,label:value});};
  const array=value=>Array.isArray(value)?value:[];
  const read=file=>{try{if(statSync(file).size>1024*1024)throw new Error();const text=readFileSync(file,'utf8'),errors=[];const value=/\.toml$/.test(file)?toml(text):/\.ya?ml$/.test(file)?yaml(text,{maxAliasCount:20}):jsonc(text,errors,{allowTrailingComma:true});if(errors.length||!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch(error){if(error.code!=='ENOENT')warnings.push('Some CLI configuration could not be read.');return {};}};
  const settings=(folder,base=path.join(home,folder))=>[read(path.join(base,'settings.json')),read(path.join(cwd,folder,'settings.json')),read(path.join(cwd,folder,'settings.local.json'))];
  if(id==='codex'){
    const config=read(path.join(env.CODEX_HOME||path.join(home,'.codex'),'config.toml'));add(config.model);
    for(const profile of Object.values(config.profiles||{}))add(profile?.model);
    // Custom provider catalogs remain owned by the CLI; never infer a catalog from an API key.
  }else if(id==='claude'){
    const configs=settings('.claude',env.CLAUDE_CONFIG_DIR||path.join(home,'.claude'));
    const variables=['ANTHROPIC_MODEL','ANTHROPIC_DEFAULT_MODEL','ANTHROPIC_DEFAULT_OPUS_MODEL','ANTHROPIC_DEFAULT_SONNET_MODEL','ANTHROPIC_DEFAULT_HAIKU_MODEL','ANTHROPIC_CUSTOM_MODEL_OPTION'];
    for(const config of configs){add(config.model);for(const m of array(config.availableModels))add(m);for(const m of Object.values(config.modelOverrides||{}))add(m);for(const row of array(config.modelPicker?.models))add(row?.model||row?.id);for(const key of variables)add(config.env?.[key]);}
    for(const key of variables)add(env[key]);
  }else if(id==='gemini'||id==='qwen'){
    for(const config of settings('.'+id)){add(typeof config.model==='string'?config.model:config.model?.name);for(const alias of Object.values(config.modelConfigs?.aliases||{}))add(alias?.modelConfig?.model);if(id==='qwen')for(const list of Object.values(config.modelProviders||{}))if(Array.isArray(list))for(const m of list)if(m&&!m.imageOnly&&!m.realtimeOnly)add(m.id);}
    add(env[id==='gemini'?'GEMINI_MODEL':'OPENAI_MODEL']);
  }else if(id==='droid'){
    const config=read(path.join(home,'.factory','settings.json'));add(config.model);for(const m of array(config.customModels))add(m?.model);
  }else if(id==='continue'){
    for(const file of ['config.yaml','config.json']){const config=read(path.join(home,'.continue',file));for(const m of array(config.models))add(m?.model);}
  }else if(id==='aider'){
    for(const base of [home,cwd]){const config=read(path.join(base,'.aider.conf.yml'));add(config.model);}
    add(env.AIDER_MODEL);
  }else if(id==='goose'){
    const config=read(path.join(env.XDG_CONFIG_HOME||path.join(home,'.config'),'goose','config.yaml'));add(config.GOOSE_MODEL);add(env.GOOSE_MODEL);
  }else if(id==='kimi'){
    const config=read(path.join(home,'.kimi','config.toml'));for(const model of Object.values(config.models||{}))add(model?.model);
  }
  return {models,warnings:[...new Set(warnings)]};
}

export async function codexModels(command,{cwd=process.cwd(),createBridge=(...args)=>new CodexBridge(...args),timeout=8000}={}){
  const bridge=createBridge(command,cwd,{projectCwd:cwd});
  let timer;
  try{
    await Promise.race([bridge.ready(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('CLI initialization timed out.')),timeout);})]);clearTimeout(timer);const models=[],seen=new Set();let cursor;
    do{const page=await bridge.request('model/list',{limit:100,...(cursor?{cursor}:{})},8000);models.push(...(Array.isArray(page.data)?page.data:[]));cursor=page.nextCursor;if(cursor&&seen.has(cursor))break;seen.add(cursor);}while(cursor&&models.length<2000);
    return models;
  }finally{clearTimeout(timer);bridge.close();}
}

// Claude's initialization control response contains its model picker. No user message or inference is sent.
export function claudeModels(command,{cwd=process.cwd(),timeout=8000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command.command,[...command.args,'-p','--input-format','stream-json','--output-format','stream-json','--verbose'],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let buffer='',bytes=0,done=false;
    const finish=(error,models)=>{if(done)return;done=true;clearTimeout(timer);child.stdin.destroy();child.kill();error?reject(error):resolve(models);};
    const timer=setTimeout(()=>finish(new Error('Model discovery timed out.')),timeout);
    child.on('error',()=>finish(new Error('CLI could not start.')));child.on('close',()=>finish(new Error('CLI model discovery ended.')));child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{bytes+=Buffer.byteLength(chunk);if(bytes>512000)return finish(new Error('CLI catalog too large.'));buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let msg;try{msg=JSON.parse(line);}catch{continue;}if(msg.type==='control_response'&&msg.response?.request_id==='yogi-models'){if(msg.response.subtype==='error')return finish(new Error('CLI model discovery unavailable.'));return finish(null,msg.response.response?.models||[]);}}});
    child.stdin.write(JSON.stringify({type:'control_request',request_id:'yogi-models',request:{subtype:'initialize',hooks:{}}})+'\n');
  });
}

export async function cliModels(settings,command,{cwd=process.cwd(),execute=exec}={}){
  if(settings.id==='codex')return codexModels(command,{cwd});
  if(settings.id==='claude')return claudeModels(command,{cwd});
  const args=settings.id==='opencode'?['models']:settings.id==='aider'?['--list-models','']:null;
  if(!args)return [];
  const {stdout}=await execute(command.command,[...command.args,...args],{cwd,windowsHide:true,timeout:8000,maxBuffer:512000});
  return stdout.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').split(/\r?\n/).filter(s=>settings.id!=='aider'||/^\s*-\s+/.test(s)).map(s=>s.trim().replace(/^-\s+/,''))
    .filter(s=>valid(settings.id,s)&&(settings.id!=='opencode'||/^[\w-]+\/.+/.test(s))).slice(0,2000).map(id=>({id,label:id}));
}

export function createModelDiscovery({locate=locateCLI,list=cliModels,config=configuredModels,now=Date.now}={}){
  const cache=new Map();
  return async function discover(settings,{cwd=process.cwd(),force=false,profiles=[],selected=settings}={}){
    settings=validateEngine(settings);let command;
    try{command=await locate(settings);}catch{return modelOptions(settings.id,{profiles,selected,installed:false});}
    const configured=config(settings.id,{cwd});
    const key=JSON.stringify([settings.id,command.command,command.args,cwd]);
    let entry=cache.get(key);
    if(!entry||force||now()-entry.at>60000){
      entry={at:now(),promise:Promise.resolve().then(()=>list(settings,command,{cwd})).then(models=>({models}),()=>({models:[],warning:'Live model discovery is unavailable for this CLI version or connection.'}))};
      cache.delete(key);cache.set(key,entry);if(cache.size>32)cache.delete(cache.keys().next().value);
    }
    const live=await entry.promise;
    return modelOptions(settings.id,{profiles,selected,installed:true,live:live.models,configured:configured.models,warning:[...configured.warnings,live.warning].filter(Boolean).join(' ')});
  };
}
