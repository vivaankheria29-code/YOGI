import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync,lstatSync} from 'node:fs';
import path from 'node:path';
const valid=mode=>mode==='full'||mode==='workspace';
export function readAccessMode(root){
 const file=path.join(root,'data','access-mode.json');
 try{if(lstatSync(path.dirname(file)).isSymbolicLink())return 'workspace';if(lstatSync(file).isSymbolicLink())return 'workspace';const mode=JSON.parse(readFileSync(file,'utf8')).mode;return valid(mode)?mode:'workspace';}
 catch(error){return error.code==='ENOENT'?'full':'workspace';}
}
export function accessPolicy(mode){
 if(!valid(mode))throw new Error('Unknown YOGI access mode.');
 return mode==='full'?{sandbox:'danger-full-access',approvalPolicy:'never',approvalsReviewer:'user'}:{sandbox:'workspace-write',approvalPolicy:'on-request',approvalsReviewer:'user'};
}
export function accessStatus(root){const mode=readAccessMode(root);return {mode,label:mode==='full'?'Full access':'Workspace access',localApprovalPrompts:mode!=='full',externalConsentRequired:true};}
export function saveAccessMode(root,mode){
 if(!valid(mode))throw Object.assign(new Error('Choose Full access or Workspace access.'),{status:400});
 const dir=path.join(root,'data');mkdirSync(dir,{recursive:true});if(lstatSync(dir).isSymbolicLink())throw new Error('Access settings folder must not be a link.');
 const file=path.join(dir,'access-mode.json');try{if(lstatSync(path.dirname(file)).isSymbolicLink())return 'workspace';if(lstatSync(file).isSymbolicLink())throw new Error('Access settings must not be a link.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const temporary=file+'.'+randomUUID()+'.tmp';writeFileSync(temporary,JSON.stringify({mode},null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});renameSync(temporary,file);return accessStatus(root);
}
