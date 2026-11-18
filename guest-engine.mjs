import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {EngineManager} from './engine-manager.mjs';
import {saveAccessMode,readAccessMode} from './access-policy.mjs';
export function createGuestRunner({root,settings,acquire,release,manager=(...args)=>new EngineManager(...args)}){
  return async({message,history,sessionId,send,signal})=>{
    if(!/^[a-f0-9-]{36}$/i.test(sessionId))throw new Error('Invalid guest session.');
    if(!acquire())throw new Error('The host is busy.');
    let engine;const controller=new AbortController();
    try{
      const guestRoot=path.join(root,'work','wifi-guests',sessionId),cwd=path.join(guestRoot,'workspace');
      mkdirSync(path.join(cwd,'files'),{recursive:true});mkdirSync(path.join(cwd,'work'),{recursive:true});
      saveAccessMode(guestRoot,readAccessMode(root));
      engine=manager(guestRoot,cwd,{projectCwd:cwd});engine.settings={...settings()};
      await engine.run({text:'Answer this Wi-Fi guest’s question. Do not access host files or integrations.\n'+message,history,chatId:sessionId,attachments:[],plugins:false,web:false,remote:true,signal:AbortSignal.any([signal,controller.signal]),send:event=>{
        if(event.type==='approval'){send({type:'notice',text:'This request needs an approval. Ask the host to handle it locally.'});controller.abort();return;}
        send(event);
      }});
    }finally{engine?.close();release();}
  };
}
