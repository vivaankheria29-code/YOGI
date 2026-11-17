import {installBundledSkills} from './skill-library.mjs';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,openSync,closeSync,writeFileSync,readFileSync,realpathSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {resolveChrome} from './runtime-locator.mjs';
import {readEngine,locateCLI,CLI_PROVIDERS} from './cli-providers.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const instanceId=createHash('sha256').update(realpathSync(root)).digest('hex').slice(0,24);
const options=new Set(process.argv.slice(2));
async function statusAt(port){
  try{const response=await fetch(`http://127.0.0.1:${port}/api/status`,{signal:AbortSignal.timeout(1200)});return response.ok?await response.json():null;}catch{return null;}
}
async function freePort(port){return new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
async function launchBrowser(chrome,url){
  let command,args;
  if(chrome){command=chrome;args=[url];}
  else if(process.platform==='darwin'){command='open';args=[url];}
  else if(process.platform==='win32'){command='rundll32.exe';args=['url.dll,FileProtocolHandler',url];}
  else{command='xdg-open';args=[url];}
  await new Promise((resolve,reject)=>{const child=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
  if(!chrome)console.log('Chrome was not found; opened the default browser. Install Chrome for Chrome-specific voice support.');
}
async function main(){
  if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 or newer is required. Use the supplied click-to-start launcher.');
  if(!options.has('--diagnose'))installBundledSkills(root,{log:console.log});
  // A second click should open the running app, without redoing Codex startup.
  if(!options.has('--diagnose')){
    let previous;try{previous=JSON.parse(readFileSync(path.join(root,'work/launcher.json'),'utf8')).port;}catch{}
    for(const candidate of [...new Set([previous,Number(process.env.PORT||8341)].filter(p=>Number.isInteger(p)&&p>=1024&&p<=65535))]){
      const running=await statusAt(candidate);
      if(running?.appId==='yogi'&&running.instanceId===instanceId){
        const url=`http://localhost:${candidate}/`;console.log('Already running: '+url);
        if(!options.has('--no-browser'))await launchBrowser(resolveChrome(),url);return;
      }
    }
  }
  let settings;try{settings=readEngine(root);}catch{settings={id:'codex',executable:'',model:''};}
  const chrome=resolveChrome(),preset=CLI_PROVIDERS.find(p=>p.id===settings.id);let cli=null;
  try{cli=await locateCLI(settings);}catch{console.log(preset.name+' is not installed yet. Choose or configure a CLI in YOGI Settings → Engine.');}
  if(options.has('--diagnose')){console.log(JSON.stringify({node:process.version,engine:settings.id,executable:cli?.path||null,chrome:chrome||'default browser fallback',folder:root},null,2));return;}
  console.log('YOGI · starting your local assistant');
  if(cli)console.log(preset.name+' detected: '+cli.path);
  mkdirSync(path.join(root,'work'),{recursive:true});
  let requested=Number(process.env.PORT||8341);
  if(!Number.isInteger(requested)||requested<1024||requested>65525)throw new Error('PORT must be a number between 1024 and 65525.');
  let previousPort;try{previousPort=JSON.parse(readFileSync(path.join(root,'work','launcher.json'),'utf8')).port;}catch{}
  let port,existing=false;
  for(const candidate of [...new Set([previousPort,...Array.from({length:10},(_,i)=>requested+i)].filter(p=>Number.isInteger(p)&&p>=1024&&p<=65535))]){
    const status=await statusAt(candidate);
    if(status?.appId==='yogi'&&status.instanceId===instanceId){port=candidate;existing=true;break;}
    if(await freePort(candidate)){port=candidate;break;}
  }
  if(!port)throw new Error('No free local port was found. Close an older instance or set PORT.');
  if(!existing){
    const stdout=openSync(path.join(root,'work/server.log'),'a'),stderr=openSync(path.join(root,'work/server-error.log'),'a');
    const entry=existsSync(path.join(root,'server.bundle.mjs'))?'server.bundle.mjs':'server.mjs';
    const child=spawn(process.execPath,[path.join(root,entry)],{cwd:root,env:{...process.env,PATH:path.dirname(process.execPath)+path.delimiter+(process.env.PATH||''),PORT:String(port),...(settings.id==='codex'&&cli?{YOGI_CODEX_PATH:cli.path}: {})},detached:true,windowsHide:true,stdio:['ignore',stdout,stderr]});
    await new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',resolve);});
    closeSync(stdout);closeSync(stderr);child.unref();
    writeFileSync(path.join(root,'work/server.pid'),String(child.pid));
    let ready=false;
    for(let i=0;i<80;i++){const status=await statusAt(port);if(status?.appId==='yogi'&&status.instanceId===instanceId){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,300));}
    if(!ready)throw new Error('Server did not become ready. Open work/server-error.log for details.');
  }
  const url=`http://localhost:${port}/`;
  writeFileSync(path.join(root,'work/launcher.json'),JSON.stringify({port,url},null,2));
  console.log((existing?'Already running: ':'Ready: ')+url);
  if(!options.has('--no-browser'))await launchBrowser(chrome,url);
}
main().catch(error=>{console.error('\nCould not start: '+error.message);console.error('Keep the extracted folder together. See START HERE.txt for help.');process.exitCode=1;});
