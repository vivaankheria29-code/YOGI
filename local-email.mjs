import path from 'node:path';
import {readArtifactBytes} from './local-artifacts.mjs';

export const emailTool={type:'function',name:'jarvis_email_local_files',description:'Email saved local files through the connected Gmail account, only when the user asks to send them. Loads attachment bytes directly on the server. Requires a visible one-time send confirmation. Maximum total attachment size per email is 17 MiB; select fewer files if larger. Never use a shell or paste base64 into chat to attach files.',inputSchema:{type:'object',properties:{to:{type:'string'},subject:{type:'string'},body:{type:'string',description:'Plain-text message body.'},paths:{type:'array',items:{type:'string'},minItems:1,maxItems:20,description:'Saved artifact paths, e.g. coffee-beans/coffee-beans-01.png.'}},required:['to','subject','body','paths'],additionalProperties:false}};
export function prepareLocalEmail(workspace,args){
  if(!args||typeof args.to!=='string'||!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(args.to))throw new Error('One valid recipient email is required.');
  if(typeof args.subject!=='string'||/[\r\n]/.test(args.subject)||args.subject.length>300)throw new Error('A subject up to 300 characters with no line breaks is required.');
  if(typeof args.body!=='string'||args.body.length>20000)throw new Error('A message body up to 20,000 characters is required.');
  if(!Array.isArray(args.paths)||!args.paths.length||args.paths.length>20)throw new Error('Choose between 1 and 20 saved files.');
  const files=args.paths.map(p=>readArtifactBytes(workspace,p));
  if(new Set(files.map(f=>f.target)).size!==files.length)throw new Error('An attachment was selected more than once.');
  const totalBytes=files.reduce((sum,f)=>sum+f.bytes.length,0);
  if(totalBytes>17*1024*1024)throw new Error(`Attachments total ${(totalBytes/1024/1024).toFixed(2)} MiB; this reader supports up to 17 MiB per email. Select fewer files per email or request smaller copies. Nothing was sent.`);
  const mimeTypes={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.zip':'application/zip','.pdf':'application/pdf','.txt':'text/plain','.json':'application/json'};
  return {summary:{to:args.to,subject:args.subject,body:args.body,totalBytes,attachments:files.map(f=>({name:path.basename(f.target),bytes:f.bytes.length}))},arguments:{to:args.to,subject:args.subject,payload:{mime_type:'multipart/mixed',parts:[{mime_type:'text/plain',charset:'utf-8',body:{content:args.body}},...files.map(f=>({mime_type:mimeTypes[path.extname(f.target).toLowerCase()]||'application/octet-stream',filename:path.basename(f.target),content_disposition:'attachment',body:{base64_url_content:f.bytes.toString('base64url')}}))]}}};
}
