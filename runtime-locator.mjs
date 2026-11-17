import {readdirSync,statSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function isFile(file){try{return !!file&&statSync(file).isFile();}catch{return false;}}
function which(name){
  const result=spawnSync(process.platform==='win32'?'where.exe':'which',[name],{encoding:'utf8',windowsHide:true,timeout:5000});
  return result.status===0?result.stdout.trim().split(/\r?\n/).filter(isFile):[];
}
function newestChildren(directory){
  try{return readdirSync(directory,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(directory,e.name)).sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs);}catch{return [];}
}
export function codexCandidates({platform=process.platform,env=process.env,home=os.homedir(),lookup=which}={}){
  const candidates=[];
  if(env.YOGI_CODEX_PATH||env.SOPHIA_CODEX_PATH||env.JANMATE_CODEX_PATH||env.JARVIS_CODEX_PATH)candidates.push(env.YOGI_CODEX_PATH||env.SOPHIA_CODEX_PATH||env.JANMATE_CODEX_PATH||env.JARVIS_CODEX_PATH);
  candidates.push(...lookup(platform==='win32'?'codex.exe':'codex'));
  candidates.push(path.join(home,'.local','bin',platform==='win32'?'codex.exe':'codex'));
  if(platform==='win32'){
    const local=env.LOCALAPPDATA||path.join(home,'AppData','Local');
    for(const directory of newestChildren(path.join(local,'OpenAI','Codex','bin')))candidates.push(path.join(directory,'codex.exe'));
    for(const parent of [env.APPDATA&&path.join(env.APPDATA,'npm'),env.PROGRAMFILES&&path.join(env.PROGRAMFILES,'nodejs')].filter(Boolean))candidates.push(path.join(parent,'node_modules','@openai','codex','bin','codex.js'));
    for(const shim of lookup('codex.cmd'))candidates.push(path.join(path.dirname(shim),'node_modules','@openai','codex','bin','codex.js'));
  }else if(platform==='darwin'){
    for(const app of ['/Applications/Codex.app',path.join(home,'Applications','Codex.app')]){
      candidates.push(path.join(app,'Contents/Resources/codex'),path.join(app,'Contents/Resources/bin/codex'));
    }
    candidates.push('/opt/homebrew/bin/codex','/usr/local/bin/codex');
  }else{
    candidates.push('/usr/local/bin/codex','/usr/bin/codex','/snap/bin/codex','/opt/Codex/resources/codex','/opt/codex/resources/codex');
  }
  return [...new Set(candidates.filter(Boolean))];
}
export function commandForCodex(file){let actual=file;try{actual=realpathSync(file);}catch{}return /\.[cm]?js$/i.test(actual)?{command:process.execPath,args:[actual],path:actual}:{command:file,args:[],path:file};}
export function resolveCodex(options={}){
  const override=(options.env||process.env).YOGI_CODEX_PATH||(options.env||process.env).SOPHIA_CODEX_PATH||(options.env||process.env).JANMATE_CODEX_PATH||(options.env||process.env).JARVIS_CODEX_PATH;
  if(override&&!isFile(override))throw new Error('YOGI_CODEX_PATH points to a missing file. Correct or remove that override.');
  for(const file of codexCandidates(options)){
    if(isFile(file)&&!/\.(cmd|bat)$/i.test(file))return commandForCodex(file);
  }
  throw new Error('Codex was not found. Install the Codex desktop app or CLI, or set YOGI_CODEX_PATH to its executable. See https://developers.openai.com/codex/cli/');
}
export function chromeCandidates({platform=process.platform,env=process.env,home=os.homedir(),lookup=which}={}){
  const files=[];
  if(env.YOGI_CHROME_PATH||env.SOPHIA_CHROME_PATH||env.JANMATE_CHROME_PATH)files.push(env.YOGI_CHROME_PATH||env.SOPHIA_CHROME_PATH||env.JANMATE_CHROME_PATH);
  if(platform==='win32'){
    files.push(...lookup('chrome.exe'));
    for(const base of [env.PROGRAMFILES,env['PROGRAMFILES(X86)'],env.LOCALAPPDATA].filter(Boolean))files.push(path.join(base,'Google','Chrome','Application','chrome.exe'));
  }else if(platform==='darwin'){
    files.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',path.join(home,'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
  }else for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser'])files.push(...lookup(name));
  return [...new Set(files.filter(Boolean))];
}
export function resolveChrome(options={}){return chromeCandidates(options).find(isFile)||null;}
