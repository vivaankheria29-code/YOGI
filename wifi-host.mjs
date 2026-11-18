import http from 'node:http';
import os from 'node:os';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));};
export function privateIPv4(ip){const parts=ip.split('.').map(Number);if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return false;return parts[0]===10||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===169&&parts[1]===254;}
export function wifiAddresses(interfaces=os.networkInterfaces()){
  return [...new Set(Object.values(interfaces).flat().filter(i=>i&&!i.internal&&(i.family==='IPv4'||i.family===4)&&privateIPv4(i.address)).map(i=>i.address))];
}
async function body(req,max=16000){if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'Expected JSON.');const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw fail(413,'Request too large.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(400,'Invalid request.');}}
const cookie=(token,age=28800)=>`yogi_guest=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}`;

export function createWifiHost({run,isBusy=()=>false,serve,addresses=wifiAddresses,sessionTTL=8*3600000,now=Date.now}={}){
  let server=null,port=0,code='',starting=null,active=null,pumpTimer=null,epoch=0;
  const sessions=new Map(),attempts=new Map(),queue=[];
  const present=()=>[...sessions.values()].filter(session=>session.controller||now()-session.at<20000);
  const status=()=>({enabled:!!server?.listening,port:server?.listening?port:null,urls:server?.listening?addresses().map(ip=>`http://${ip}:${port}/`):[],accessCode:server?.listening?code:'',clients:present().length,devices:present().map(({id,label,phase})=>({id,label,phase})),queued:queue.length,answering:!!active});
  function forget(token,session){session.controller?.abort();for(let index=queue.length-1;index>=0;index--)if(queue[index].session===session){const job=queue.splice(index,1)[0];if(!job.res.destroyed)job.res.end();}sessions.delete(token);}
  function sessionFor(req){const token=/(?:^|;\s*)yogi_guest=([A-Za-z0-9_-]+)/.exec(req.headers.cookie||'')?.[1],session=sessions.get(token);if(!session)return null;if(now()-session.at>sessionTTL){forget(token,session);return null;}session.at=now();return session;}
  function send(job,event){if(!job.res.destroyed&&!job.res.writableEnded)job.res.write(JSON.stringify(event)+'\n');}
  function schedule(){if(pumpTimer||!server?.listening)return;pumpTimer=setTimeout(()=>{pumpTimer=null;pump();},100);pumpTimer.unref();}
  async function pump(){
    if(active||!server?.listening)return;
    while(queue[0]?.controller.signal.aborted){const canceled=queue.shift();if(!canceled.res.destroyed)canceled.res.end();if(canceled.session.controller===canceled.controller)canceled.session.controller=null;}
    if(!queue.length)return;if(isBusy()){schedule();return;}
    const job=queue.shift();active=job;job.session.phase='thinking';let answer='',failed=false;
    try{
      if(job.controller.signal.aborted)return;
      await run({message:job.message,history:job.session.history,sessionId:job.session.id,signal:job.controller.signal,send:event=>{
        if(['draft','delta','message'].includes(event.type))job.session.phase='answering';
        if(event.type==='message')answer+=(answer?'\n':'')+String(event.text||'');
        if(['draft','delta','message','status','notice'].includes(event.type))send(job,event);
      }});
      if(!job.controller.signal.aborted){job.session.history.push({role:'user',text:job.message},{role:'assistant',text:answer.slice(-8000)});job.session.history=job.session.history.slice(-16);send(job,{type:'done'});}
    }catch{failed=!job.controller.signal.aborted;if(!job.controller.signal.aborted)send(job,{type:'error',text:'The host CLI could not finish. Ask the host to check its connection and permissions.'});}
    finally{job.session.phase=failed?'error':'idle';if(job.session.controller===job.controller)job.session.controller=null;if(!job.res.destroyed)job.res.end();if(active===job)active=null;schedule();}
  }
  async function handle(req,res){
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const hosts=new Set(['127.0.0.1','localhost',...addresses()].map(ip=>`${ip}:${port}`));
    if(!hosts.has(req.headers.host))return json(res,403,{error:'Invalid host.'});
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'Invalid origin.'});
    const url=new URL(req.url,'http://localhost');
    if(req.headers['sec-fetch-site']==='cross-site'&&url.pathname!=='/')return json(res,403,{error:'Same-origin requests only.'});
    const assets={'/character-art.js':['character-art.js','text/javascript; charset=utf-8'],'/character.js':['character.js','text/javascript; charset=utf-8'],'/character-catalog.js':['character-catalog.js','text/javascript; charset=utf-8'],'/character.css':['character.css','text/css; charset=utf-8'],'/':['wifi-guest.html','text/html; charset=utf-8'],'/wifi-guest.js':['wifi-guest.js','text/javascript; charset=utf-8'],'/wifi-guest.css':['wifi-guest.css','text/css; charset=utf-8'],'/network-face.js':['network-face.js','text/javascript; charset=utf-8'],'/guest-appearance.js':['guest-appearance.js','text/javascript; charset=utf-8'],'/orbface.js':['orbface.js','text/javascript; charset=utf-8'],'/dotface.js':['dotface.js','text/javascript; charset=utf-8'],'/expressions.js':['expressions.js','text/javascript; charset=utf-8'],'/fonts/grotesk-400.woff2':['fonts/grotesk-400.woff2','font/woff2'],'/fonts/grotesk-500.woff2':['fonts/grotesk-500.woff2','font/woff2'],'/fonts/doto-900.woff2':['fonts/doto-900.woff2','font/woff2']};
    if(req.method==='GET'&&assets[url.pathname])return serve(req,res,...assets[url.pathname]);
    if(url.pathname==='/api/join'&&req.method==='POST'){
      const address=req.socket.remoteAddress;let attempt=attempts.get(address);if(!attempt||now()-attempt.at>60000)attempt={at:now(),count:0};attempt.count++;attempts.set(address,attempt);if(attempts.size>256)attempts.delete(attempts.keys().next().value);if(attempt.count>10)return json(res,429,{error:'Too many attempts. Try again in a minute.'});
      const data=await body(req,1024),entered=typeof data?.code==='string'?data.code.trim():'';
      if(data?.deviceName!==undefined&&(typeof data.deviceName!=='string'||data.deviceName.length>40))return json(res,400,{error:'Use a device name under 40 characters.'});
      const expected=Buffer.from(code),provided=Buffer.from(entered);if(!entered||provided.length!==expected.length||!timingSafeEqual(provided,expected))return json(res,401,{error:'Incorrect access code. Ask the host for the current code.'});
      for(const [token,session]of sessions)if(now()-session.at>sessionTTL)forget(token,session);
      const previous=sessionFor(req);if(previous)return json(res,200,{connected:true,label:previous.label});
      if(sessions.size>=32)return json(res,503,{error:'The host has reached its guest limit.'});
      const token=randomBytes(32).toString('base64url'),label=(data.deviceName||'').replace(/[\x00-\x1f\x7f]/g,'').trim()||'Device '+(sessions.size+1);sessions.set(token,{id:randomUUID(),label,phase:'idle',at:now(),history:[],controller:null});return json(res,200,{connected:true,label},{'Set-Cookie':cookie(token)});
    }
    const session=sessionFor(req);if(!session)return json(res,401,{error:'Join with the host’s access code.'});
    if(url.pathname==='/api/session'&&req.method==='GET')return json(res,200,{connected:true,label:session.label,phase:session.phase});
    if(url.pathname==='/api/leave'&&req.method==='POST'){for(const [token,value]of sessions)if(value===session)forget(token,session);return json(res,200,{connected:false},{'Set-Cookie':cookie('',0)});}
    if(url.pathname==='/api/reset'&&req.method==='POST'){if(session.controller)return json(res,409,{error:'Wait for your current answer first.'});session.history=[];return json(res,200,{reset:true});}
    if(url.pathname==='/api/ask'&&req.method==='POST'){
      const data=await body(req);if(!data||typeof data.message!=='string'||!data.message.trim()||data.message.length>10000||Object.keys(data).some(k=>k!=='message'))return json(res,400,{error:'Send a question under 10,000 characters.'});
      if(session.controller)return json(res,409,{error:'You already have a question waiting or running.'});if(queue.length>=10)return json(res,429,{error:'The host queue is full. Try again shortly.'});
      const controller=new AbortController(),job={session,message:data.message.trim(),controller,res};session.controller=controller;session.phase='queued';
      res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});send(job,{type:'status',text:'Connected to the host. Waiting for your turn…'});
      const heartbeat=setInterval(()=>send(job,{type:'ping'}),15000);heartbeat.unref();
      res.on('close',()=>{clearInterval(heartbeat);if(!res.writableEnded)controller.abort();if(!active||active!==job){const index=queue.indexOf(job);if(index>=0)queue.splice(index,1);if(session.controller===controller){session.controller=null;session.phase='idle';}}});
      queue.push(job);schedule();return;
    }
    return json(res,404,{error:'Not found.'});
  }
  async function start(){
    if(starting)return starting;if(server?.listening)return status();
    starting=(async()=>{if(!addresses().length)throw fail(400,'No private IPv4 network was found. Connect this computer to Wi-Fi or a local network first.');const candidate=http.createServer((req,res)=>handle(req,res).catch(error=>{if(res.headersSent){if(!res.destroyed)res.end();}else json(res,error.status||500,{error:error.status?error.message:'The host could not finish the request.'});}));server=candidate;code=randomBytes(8).toString('hex');
      try{await new Promise((resolve,reject)=>{candidate.once('error',reject);candidate.listen(0,'0.0.0.0',resolve);});port=candidate.address().port;candidate.on('error',()=>{stop();});return status();}catch(error){server=null;code='';throw error;}
    })().finally(()=>{starting=null;});return starting;
  }
  async function stop(){if(starting)await starting.catch(()=>{});epoch++;clearTimeout(pumpTimer);pumpTimer=null;for(const session of sessions.values())session.controller?.abort();for(const job of queue.splice(0)){job.controller.abort();send(job,{type:'error',text:'The host stopped Wi-Fi sharing.'});job.res.end();}sessions.clear();attempts.clear();const previous=server;server=null;port=0;code='';if(previous){previous.closeAllConnections();await new Promise(resolve=>previous.close(resolve));}return status();}
  return {status,start,stop};
}
