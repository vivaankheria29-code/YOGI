import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {modelOptions,configuredModels,createModelDiscovery,claudeModels,codexModels,cliModels} from '../model-catalog.mjs';
import {discoverCLIs,CLI_PROVIDERS} from '../cli-providers.mjs';
const settings=(id,executable='')=>({id,executable,model:''});
test('no hardcoded models; saved and live IDs are deduplicated and safely labeled',()=>{
 for(const p of CLI_PROVIDERS)assert.deepEqual(modelOptions(p.id).models,[]);
 const result=modelOptions('claude',{live:[{value:'gateway/new',display_name:'Gateway'}, {id:'--bad'}, {id:'bad\nmodel'}],configured:[{id:'gateway/new'},{id:'custom/api'}],selected:{id:'claude',model:'saved/model'}});
 assert.deepEqual(result.models.map(m=>[m.id,m.source]),[['gateway/new','cli'],['custom/api','config'],['saved/model','saved']]);
 assert.equal(result.models[0].label,'Gateway');assert.throws(()=>modelOptions('shell'));
});
test('installed detection honors saved executable paths and isolates missing CLIs',async()=>{
 const seen=[];const providers=await discoverCLIs({selected:settings('claude','C:/fixture/cli.exe'),locate:async s=>{seen.push(s);if(s.id!=='claude')throw Error('missing');return {path:s.executable};}});
 assert.equal(providers.filter(p=>p.installed).length,1);assert.equal(providers.find(p=>p.id==='claude').path,'C:/fixture/cli.exe');assert.equal(seen.length,14);
});
test('custom API models come from JSONC, YAML, TOML, project and environment settings; secrets stay private',()=>{
 const home=mkdtempSync(path.join(os.tmpdir(),'yogi-models-')),cwd=path.join(home,'project');mkdirSync(cwd);
 const put=(relative,text)=>{const file=path.join(home,relative);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,text);};
 try{
  put('.claude/settings.json','{/* comment */"model":"gateway/primary","env":{"ANTHROPIC_DEFAULT_SONNET_MODEL":"gateway/sonnet","ANTHROPIC_API_KEY":"SECRET"},"availableModels":["gateway/custom"],}');
  put('project/.claude/settings.local.json','{"model":"project/model"}');
  put('.qwen/settings.json',JSON.stringify({modelProviders:{openai:[{id:'api/new',apiKey:'SECRET'},{id:'image/only',imageOnly:true}]}}));
  put('.gemini/settings.json','{"model":{"name":"gemini/private"}}');
  put('.codex/config.toml','model = "gateway/codex"\n[profiles.fast]\nmodel = "local/fast"\n');
  put('.continue/config.yaml','models:\n  - name: My API\n    model: custom/continue\n    apiKey: SECRET\n');
  put('.factory/settings.json','{"customModels":[{"model":"gateway/droid","apiKey":"SECRET"}]}');
  const opts={home,cwd,env:{ANTHROPIC_MODEL:'environment/model'}};
  assert.deepEqual(new Set(configuredModels('claude',opts).models.map(m=>m.id)),new Set(['gateway/primary','gateway/sonnet','gateway/custom','project/model','environment/model']));
  for(const [id,model] of [['qwen','api/new'],['gemini','gemini/private'],['codex','local/fast'],['continue','custom/continue'],['droid','gateway/droid']]){const result=configuredModels(id,opts);assert.ok(result.models.some(m=>m.id===model));assert.ok(!JSON.stringify(result).includes('SECRET'));}
  put('.claude/settings.json','broken SECRET');assert.match(configuredModels('claude',opts).warnings[0],/could not be read/);
  put('.claude/settings.json','null');assert.doesNotThrow(()=>configuredModels('claude',opts));
 }finally{rmSync(home,{recursive:true,force:true});}
});
test('discovery cache isolates executable and project, refreshes, and keeps partial results on errors',async()=>{
 let calls=0,clock=0;const discover=createModelDiscovery({now:()=>clock,locate:async s=>{if(s.id==='missing')throw Error('SECRET');return {command:s.executable||'fixture',args:[],path:'fixture'};},config:()=>({models:[{id:'configured/custom'}],warnings:[]}),list:async s=>{calls++;if(s.executable==='fail')throw Error('SECRET');return [{id:'live/new'}];}});
 const s=settings('claude');assert.equal((await discover(s)).source,'cli');await discover(s);assert.equal(calls,1);await discover(s,{force:true});assert.equal(calls,2);await discover(s,{cwd:'another'});assert.equal(calls,3);clock=61000;await discover(s);assert.equal(calls,4);
 const failed=await discover(settings('claude',path.resolve('other.exe'))); // exercise a distinct executable key
 assert.ok(failed.models.some(m=>m.id==='configured/custom'));
 const fallback=createModelDiscovery({locate:async()=>({command:'x',args:[]}),list:async()=>{throw Error('SECRET');},config:()=>({models:[{id:'api/custom'}],warnings:[]})});
 const result=await fallback(s);assert.equal(result.source,'config');assert.ok(!JSON.stringify(result).includes('SECRET'));
 const missing=createModelDiscovery({locate:async()=>{throw Error('SECRET');}});assert.equal((await missing(s)).installed,false);
});
test('Codex model discovery pages without depending on the selected engine and always closes',async()=>{
 let closed=0;const calls=[];const createBridge=()=>({ready:async()=>{},request:async(method,params)=>{calls.push([method,params]);return params.cursor?{data:[{model:'api/custom'}]}:{data:[{model:'native/new'}],nextCursor:'next'};},close:()=>closed++});
 assert.equal((await codexModels({}, {createBridge})).length,2);assert.equal(calls[1][1].cursor,'next');assert.equal(closed,1);
 await assert.rejects(codexModels({}, {createBridge:()=>({ready:async()=>{throw Error('offline');},close:()=>closed++})}));assert.equal(closed,2);
});
test('Claude catalog initialization sends no prompt, handles split UTF-8, and terminates on timeout',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'yogi-claude-models-')),file=path.join(dir,'fixture.mjs');
 writeFileSync(file,`import readline from 'node:readline';const lines=readline.createInterface({input:process.stdin});lines.on('line',line=>{const msg=JSON.parse(line);if(msg.type!=='control_request'||msg.request.subtype!=='initialize')process.exit(9);const result=Buffer.from(JSON.stringify({type:'control_response',response:{request_id:msg.request_id,subtype:'success',response:{models:[{value:'gateway/new',display_name:'Custom é'}]}}})+'\\n');for(const byte of result)process.stdout.write(Buffer.from([byte]));});`);
 try{const result=await claudeModels({command:process.execPath,args:[file]});assert.equal(result[0].value,'gateway/new');assert.equal(result[0].display_name,'Custom é');writeFileSync(path.join(dir,'hang.mjs'),'setInterval(()=>{},1000)');await assert.rejects(claudeModels({command:process.execPath,args:[path.join(dir,'hang.mjs')]},{timeout:100}),/timed out/);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('OpenCode discovery runs in the execution project and filters non-model output',async()=>{
 let args,options;const models=await cliModels(settings('opencode'),{command:'fixture',args:['entry.js']},{cwd:'project',execute:async(_,a,o)=>{args=a;options=o;return {stdout:'Loading...\nprovider/custom-model\nmalformed model\n'};}});
 assert.deepEqual(args,['entry.js','models']);assert.equal(options.cwd,'project');assert.deepEqual(models,[{id:'provider/custom-model',label:'provider/custom-model'}]);
});
