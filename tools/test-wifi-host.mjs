import {CodexBridge} from '../codex-bridge.mjs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createWifiHost,wifiAddresses} from '../wifi-host.mjs';
import {createGuestRunner} from '../guest-engine.mjs';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await wait(10);}throw Error('Timed out');}
const post=(url,data,cookie='')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
async function join(base,code){const response=await post(base+'/api/join',{code});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
function fixture(options={}){return createWifiHost({addresses:()=>['192.168.1.12'],serve:(_,res)=>res.end('guest page'),run:async({message,send})=>send({type:'message',text:'Answer: '+message}),...options});}
test('only private non-loopback IPv4 addresses become share links',()=>{
 assert.deepEqual(wifiAddresses({a:[{family:'IPv4',internal:false,address:'192.168.1.3'},{family:'IPv4',internal:true,address:'127.0.0.1'},{family:'IPv4',internal:false,address:'8.8.8.8'}]}),['192.168.1.3']);
});
test('hosting is opt-in; access code authentication; no admin/settings/files exposed; host/origin enforced',async()=>{
 const host=fixture();assert.equal(host.status().enabled,false);try{const state=await host.start(),base='http://127.0.0.1:'+state.port;assert.equal(state.urls[0],`http://192.168.1.12:${state.port}/`);assert.ok(state.accessCode.length>=16);assert.equal((await fetch(base)).status,200);assert.equal((await post(base+'/api/ask',{message:'hello'})).status,401);assert.equal((await post(base+'/api/join',{code:'wrong'})).status,401);
 const cookie=await join(base,state.accessCode);assert.equal((await fetch(base+'/api/settings/engine',{headers:{Cookie:cookie}})).status,404);assert.equal((await fetch(base+'/files/private',{headers:{Cookie:cookie}})).status,404);assert.equal((await fetch(base+'/api/session',{headers:{Cookie:cookie,Origin:'http://evil.test'}})).status,403);assert.equal(await new Promise((resolve,reject)=>{const req=http.get(base+'/api/session',{headers:{Cookie:cookie,Host:'evil.test:'+state.port}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);}),403);
 assert.equal((await post(base+'/api/ask',{message:'hello',executable:'evil'},cookie)).status,400);const answer=await post(base+'/api/ask',{message:'hello'},cookie);assert.match(await answer.text(),/Answer: hello/);
 const oldCode=state.accessCode;await host.stop();assert.equal(host.status().enabled,false);const restarted=await host.start();assert.notEqual(restarted.accessCode,oldCode);assert.equal((await fetch('http://127.0.0.1:'+restarted.port+'/api/session',{headers:{Cookie:cookie}})).status,401);
 }finally{await host.stop();}
});
test('questions queue behind host work, run serially, and guest histories stay separate',async()=>{
 let busy=true,active=0,max=0;const calls=[];const host=fixture({isBusy:()=>busy,run:async job=>{active++;max=Math.max(max,active);calls.push({message:job.message,history:structuredClone(job.history),session:job.sessionId});await wait(50);job.send({type:'draft',text:'Draft'});job.send({type:'message',text:'Answer '+job.message});active--;}});
 try{const state=await host.start(),base='http://127.0.0.1:'+state.port,cookie1=await join(base,state.accessCode),cookie2=await join(base,state.accessCode);const first=await post(base+'/api/ask',{message:'first'},cookie1),second=await post(base+'/api/ask',{message:'second'},cookie2);await wait(150);assert.equal(calls.length,0);assert.equal(host.status().queued,2);assert.equal((await post(base+'/api/ask',{message:'duplicate'},cookie1)).status,409);busy=false;assert.match(await first.text(),/Answer first/);assert.match(await second.text(),/Answer second/);const again=await post(base+'/api/ask',{message:'follow up'},cookie1);await again.text();assert.equal(max,1);assert.equal(calls[1].history.length,0);assert.equal(calls[2].history[0].text,'first');assert.notEqual(calls[0].session,calls[1].session);await post(base+'/api/reset',{},cookie1);await (await post(base+'/api/ask',{message:'fresh'},cookie1)).text();assert.equal(calls.at(-1).history.length,0);
 }finally{await host.stop();}
});
test('disconnecting or stopping sharing cancels active work; restart queue still runs',async()=>{
 let starts=0,aborts=0;const host=fixture({run:async({signal,send})=>{starts++;if(starts===1){await new Promise(resolve=>signal.addEventListener('abort',()=>{aborts++;resolve();},{once:true}));}else send({type:'message',text:'after restart'});}});
 try{const state=await host.start(),base='http://127.0.0.1:'+state.port,cookie=await join(base,state.accessCode);const abort=new AbortController();const response=await fetch(base+'/api/ask',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({message:'slow'}),signal:abort.signal});await until(()=>starts===1);abort.abort();await response.text().catch(()=>{});await until(()=>aborts===1);await host.stop();const next=await host.start(),newBase='http://127.0.0.1:'+next.port,newCookie=await join(newBase,next.accessCode);assert.match(await (await post(newBase+'/api/ask',{message:'new'},newCookie)).text(),/after restart/);
 }finally{await host.stop();}
});
test('guest requests run through real CLI subprocess with isolated context and selected custom model',async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'yogi-wifi-cli-')),executable=path.join(root,'fixture.mjs');
 writeFileSync(executable,`let input='';for await(const c of process.stdin)input+=c;if(!input.includes('guest-question')||input.includes('OWNER_PRIVATE_HISTORY')||!process.argv.includes('custom/api-model'))process.exit(7);console.log(JSON.stringify({type:'result',result:'Generated on host for guest'}));`);
 let busy=false;const run=createGuestRunner({root,settings:()=>({id:'claude',executable,model:'custom/api-model'}),acquire:()=>{if(busy)return false;busy=true;return true;},release:()=>{busy=false;}}),events=[];
 try{await run({message:'guest-question',history:[],sessionId:'12345678-1234-1234-1234-123456789abc',signal:new AbortController().signal,send:event=>events.push(event)});assert.ok(events.some(e=>e.type==='message'&&e.text==='Generated on host for guest'));assert.equal(busy,false);}finally{rmSync(root,{recursive:true,force:true});}
});
test('bad access-code attempts are rate limited and missing LAN fails clearly',async()=>{
 const missing=fixture({addresses:()=>[]});await assert.rejects(missing.start(),/No private IPv4/);const host=fixture();try{const state=await host.start(),base='http://127.0.0.1:'+state.port;for(let i=0;i<10;i++)assert.equal((await post(base+'/api/join',{code:'wrong'})).status,401);assert.equal((await post(base+'/api/join',{code:state.accessCode})).status,429);}finally{await host.stop();}
});

test('native guest turns do not expose owner apps or local dynamic tools',async()=>{
 const native=new CodexBridge('unused',os.tmpdir(),{model:'custom-native'});let created;native.ready=async()=>{};native.request=async(method,args)=>{if(method==='thread/start'){created=args;return {thread:{id:'guest-thread'}};}if(method==='turn/start'){queueMicrotask(()=>native.active.resolve());return {turn:{id:'guest-turn'}};}return {};};await native.run({text:'Explain the moon',remote:true,plugins:false,web:false,send:()=>{}});assert.equal(created.sandbox,'read-only');assert.ok(!created.developerInstructions.includes('The user enabled Full access'));assert.ok(!created.developerInstructions.includes('jarvis_inspect_file'));assert.deepEqual(created.dynamicTools,[]);assert.equal(created.config['features.apps'],false);assert.ok(created.developerInstructions.startsWith('You are YOGI, answering a question from an invited Wi-Fi guest'));native.close();
});

test('host sees a named face per present device with no conversation or credentials in the roster',async()=>{
 let time=1000;const host=fixture({now:()=>time});try{const state=await host.start(),base='http://127.0.0.1:'+state.port;const response=await post(base+'/api/join',{code:state.accessCode,deviceName:'My phone'});const token=response.headers.get('set-cookie').split(';')[0];assert.equal(host.status().devices.length,1);assert.equal(host.status().devices[0].label,'My phone');assert.equal(host.status().devices[0].phase,'idle');assert.deepEqual(Object.keys(host.status().devices[0]).sort(),['id','label','phase']);time+=21000;assert.equal(host.status().devices.length,0);await fetch(base+'/api/session',{headers:{Cookie:token}});assert.equal(host.status().devices.length,1);await post(base+'/api/leave',{},token);assert.deepEqual(host.status().devices,[]);}finally{await host.stop();}
});
