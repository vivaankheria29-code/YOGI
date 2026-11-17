import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {CodexBridge} from './codex-bridge.mjs';
import {CLIBridge} from './cli-bridge.mjs';
import {createImageCollector} from './generated-images.mjs';
import {CLI_PROVIDERS,readEngine,saveEngine,validateEngine,locateCLI,capabilities} from './cli-providers.mjs';
const exec=promisify(execFile);
export class EngineManager {
  constructor(root,cwd,{locate=locateCLI}={}){this.root=root;this.cwd=cwd;this.locate=locate;this.backend=null;this.threads=new Map();this.cached=null;this.pending=null;this.epoch=0;try{this.settings=readEngine(root);}catch{this.settings={id:'codex',executable:'',model:''};}}
  get images(){return this.backend?.images||(this.imageFallback??=createImageCollector(this.cwd));}
  async ensure(){if(this.backend)return this.backend;const settings=this.settings,epoch=this.epoch;const executable=await this.locate(settings);if(epoch!==this.epoch)throw new Error('CLI changed; retry the request.');this.backend=settings.id==='codex'?new CodexBridge(executable,this.cwd,{model:settings.model}):new CLIBridge(executable,this.cwd,settings);this.threads=this.backend.threads;return this.backend;}
  async status(force=false){
    if(!force&&this.cached&&Date.now()-this.cached.at<10000)return this.cached.value;if(this.pending)return this.pending;
    const settings=this.settings,preset=CLI_PROVIDERS.find(p=>p.id===settings.id),epoch=this.epoch;
    this.pending=(async()=>{let found=false,connected=false,detail='',auth='unknown',executable='';try{const located=await this.locate(settings);found=true;executable=located.path;if(settings.id==='codex'){try{await exec(located.command,[...located.args,'login','status'],{windowsHide:true,timeout:7000,maxBuffer:64000});connected=true;auth='signed-in';}catch{auth='sign-in-needed';detail='Sign in to Codex in your terminal, then reconnect.';}}else{connected=true;detail='CLI found. Sign-in and model access will be checked by the CLI when you send a message.';}}catch(error){detail=error.message;}
      const value={...settings,name:preset.name,found,connected,auth,detail,path:executable,capabilities:capabilities(settings.id),docs:preset.docs};if(epoch===this.epoch)this.cached={at:Date.now(),value};return value;
    })().finally(()=>{if(epoch===this.epoch)this.pending=null;});return this.pending;
  }
  async options(){return {selected:this.settings,providers:CLI_PROVIDERS.map(({format,...p})=>({...p,capabilities:capabilities(p.id)})),status:await this.status()};}
  configure(value){const settings=validateEngine(value);saveEngine(this.root,settings);this.close();this.settings=settings;this.cached=null;this.pending=null;return settings;}
  async test(){const settings=this.settings,located=await this.locate(settings);await exec(located.command,[...located.args,'--version'],{windowsHide:true,timeout:7000,maxBuffer:64000});return {installed:true,name:CLI_PROVIDERS.find(p=>p.id===settings.id).name,authenticationVerified:false};}
  async catalog(force=false){if(this.settings.id!=='codex')return {apps:[],localPlugins:[],unsupported:true,message:'This panel is available with Codex. Other CLIs use their own integrations.'};return (await this.ensure()).catalog(force);}
  respond(id,data){if(!this.backend)throw new Error('No active CLI approval.');return this.backend.respond(id,data);}
  async run(options){return (await this.ensure()).run(options);}
  close(){this.epoch++;this.backend?.close();this.backend=null;this.threads=new Map();this.cached=null;this.pending=null;}
}
