import {realpath,stat,readFile,mkdir,writeFile,rename,unlink,copyFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {safeFilename} from './uploads.mjs';
const problem=(status,message)=>Object.assign(new Error(message),{status});
const MAX_EDIT=2*1024*1024,MAX_HEX=256*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(base,file)=>{const rel=path.relative(base,file);return !!rel&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);};
const TEXT=/^(txt|md|markdown|log|csv|tsv|json|jsonl|xml|svg|html?|css|scss|sass|less|js|mjs|cjs|jsx|ts|tsx|py|ipynb|java|c|cc|cpp|h|hpp|cs|go|rs|rb|php|swift|kt|sh|ps1|bat|cmd|sql|yaml|yml|toml|ini|cfg|conf|rtf|tex|srt|vtt)$/i;
const nativeDocs=/\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|pages|numbers|key|png|jpe?g|gif|webp|bmp|svg|avif|heic|mp3|wav|m4a|ogg|flac|aac|mp4|mov|webm|mkv|avi|blend|psd|ai|fig|skp|dwg|dxf|step|stp|stl|obj|glb|gltf|fbx|zip|7z|rar)$/i;
const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',svg:'image/svg+xml',pdf:'application/pdf',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',flac:'audio/flac',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'};
function decode(bytes){
 let encoding='utf8',body=bytes,bom=false;
 if(bytes[0]===0xff&&bytes[1]===0xfe){encoding='utf16le';body=bytes.subarray(2);bom=true;}
 else if(bytes[0]===0xfe&&bytes[1]===0xff){encoding='utf16be';body=bytes.subarray(2);bom=true;}
 else if(bytes.subarray(0,3).equals(Buffer.from([239,187,191]))){body=bytes.subarray(3);bom=true;}
 try{const text=new TextDecoder(encoding==='utf8'?'utf-8':encoding==='utf16le'?'utf-16le':'utf-16be',{fatal:true,ignoreBOM:true}).decode(body);const controls=[...text.slice(0,50000)].filter(c=>c<' '&&!['\n','\r','\t','\f'].includes(c)).length;if(controls>Math.max(0,text.length*.01)||text.includes('\0'))return null;return {text,encoding,bom,newline:text.includes('\r\n')?'crlf':text.includes('\r')&&!text.includes('\n')?'cr':'lf'};}catch{return null;}
}
function encode(text,encoding,bom){
 let bytes;if(encoding==='utf8')bytes=Buffer.from(text,'utf8');else if(['utf16le','utf16be'].includes(encoding)){bytes=Buffer.from(text,'utf16le');if(encoding==='utf16be')bytes.swap16();}else throw problem(400,'Unsupported text encoding.');
 return bom?Buffer.concat([Buffer.from(encoding==='utf8'?[239,187,191]:encoding==='utf16le'?[255,254]:[254,255]),bytes]):bytes;
}
// Read ZIP directory and bounded Office XML without extracting paths or running content.
function zipOverview(bytes,ext){
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)return null;const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16);if(count>20000)return {entries:[],note:'Archive has too many entries for an inline overview.'};
 let p=offset,total=0,xml=[];const entries=[];
 for(let i=0;i<count;i++){
  if(p+46>bytes.length||bytes.readUInt32LE(p)!==0x02014b50)break;const method=bytes.readUInt16LE(p+10),compressed=bytes.readUInt32LE(p+20),size=bytes.readUInt32LE(p+24),n=bytes.readUInt16LE(p+28),extra=bytes.readUInt16LE(p+30),comment=bytes.readUInt16LE(p+32),local=bytes.readUInt32LE(p+42);if(p+46+n>bytes.length)break;const name=bytes.toString('utf8',p+46,p+46+n);p+=46+n+extra+comment;if(entries.length<200)entries.push({name:name.slice(0,600),size});
  const wanted=ext==='docx'?name==='word/document.xml':ext==='xlsx'?/^(xl\/sharedStrings.xml|xl\/workbook.xml|xl\/worksheets\/sheet[1-3].xml)$/.test(name):ext==='pptx'?/^ppt\/slides\/slide[1-9].xml$/.test(name):false;
  if(!wanted||size>1024*1024||total+size>3*1024*1024||local+30>bytes.length||bytes.readUInt32LE(local)!==0x04034b50)continue;
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);if(start+compressed>bytes.length)continue;
  try{const data=method===0?bytes.subarray(start,start+compressed):method===8?inflateRawSync(bytes.subarray(start,start+compressed),{maxOutputLength:1024*1024}):null;if(data){total+=data.length;xml.push({name,xml:data.toString('utf8')});}}catch{}
 }
 return {entries,xml,count,note:'Read-only content overview. Native layout, charts and formatting need the original app.'};
}
export function createFileWorkspace({filesRoot,uploads,isBusy=()=>false,opener}){
 const locks=new Set();
 async function editedTarget(originalName){
  const folder=path.join(filesRoot,'edited');await mkdir(folder,{recursive:true});const base=await realpath(filesRoot),folderReal=await realpath(folder);if(!within(base,folderReal))throw problem(403,'Edited files folder is outside the workspace.');
  const id=randomUUID(),directory=path.join(folderReal,id);await mkdir(directory);let name=safeFilename(originalName);if(name.startsWith('.'))name='_'+name;
  return {target:path.join(directory,name),url:'/files/edited/'+id+'/'+encodeURIComponent(name),name};
 }
 async function resolve(ref){
  if(ref?.id){if(typeof ref.chatId!=='string')throw problem(400,'A conversation is required.');const [record]=await uploads.resolve(ref.chatId,[ref.id]);return {path:record.path,name:record.name,uploaded:true,id:record.id,chatId:ref.chatId};}
  let url;try{url=new URL(String(ref?.url||''),'http://localhost');}catch{throw problem(400,'Invalid file link.');}
  if(!['localhost','127.0.0.1'].includes(url.hostname)||!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.pathname.startsWith('/files/'))throw problem(400,'Choose a local YOGI file.');
  let relative;try{relative=decodeURIComponent(url.pathname.slice(7));}catch{throw problem(400,'Invalid file path.');}
  if(relative.split(/[\\/]/).some(p=>!p||p.startsWith('.')||/[\x00-\x1f:]/.test(p)))throw problem(403,'This file is not available in the workspace.');
  const base=await realpath(filesRoot),target=await realpath(path.resolve(base,relative));if(!within(base,target))throw problem(403,'This file is outside YOGI’s files.');const info=await stat(target);if(!info.isFile())throw problem(400,'Choose a file.');
  return {path:target,name:path.basename(target),uploaded:relative.replaceAll('\\','/').startsWith('uploads/'),url:'/files/'+relative.split(/[\\/]/).map(encodeURIComponent).join('/')};
 }
 async function inspect(ref){
  const file=await resolve(ref),info=await stat(file.path),ext=path.extname(file.name).slice(1).toLowerCase();
  const result={...file,path:undefined,size:info.size,updatedAt:info.mtimeMs,ext,mime:types[ext]||'application/octet-stream',canOpenNative:TEXT.test(ext)||nativeDocs.test(file.name),modelPath:path.relative(filesRoot,file.path).split(path.sep).join('/'),editable:false};
  if(info.size<=MAX_EDIT){const bytes=await readFile(file.path);result.hash=sha(bytes);const text=decode(bytes);if(text){Object.assign(result,text,{kind:'text',editable:true});}else{result.kind='binary';if(info.size<=MAX_HEX)result.hex=bytes.toString('hex').match(/.{1,32}/g)?.map(line=>line.match(/../g).join(' ')).join('\n')||'';}}
  if(!result.kind)result.kind='binary';
  if(['docx','xlsx','pptx','zip','odt','ods','odp'].includes(ext)&&info.size<=16*1024*1024){try{result.archive=zipOverview(await readFile(file.path),ext);}catch{}}
  result.contentUrl='/api/file-workspace/content?'+new URLSearchParams(file.id?{id:file.id,chatId:file.chatId}:{url:file.url});return result;
 }
 async function save(data){
  if(isBusy())throw problem(409,'Finish or stop YOGI’s current reply before saving this file.');
  const existing=data?.ref?await resolve(data.ref):null,key=existing?.path||randomUUID();if(locks.has(key))throw problem(409,'This file is already being saved.');locks.add(key);
  try{
   let bytes;if(data.format==='hex'){if(typeof data.text!=='string'||!/^[0-9a-f\s]*$/i.test(data.text))throw problem(400,'Hex edits must contain pairs of hexadecimal digits.');const hex=data.text.replace(/\s/g,'');if(hex.length%2)throw problem(400,'Each byte needs two hexadecimal digits.');bytes=Buffer.from(hex,'hex');if(bytes.length>MAX_HEX)throw problem(413,'Hex editing is limited to 256 KB.');}
   else {if(typeof data.text!=='string')throw problem(400,'Text is required.');bytes=encode(data.text,data.encoding||'utf8',data.bom===true);}
   if(bytes.length>MAX_EDIT)throw problem(413,'Inline editing is limited to 2 MB. Use the native app for a larger file.');
   if(existing){const info=await stat(existing.path);if(info.size>MAX_EDIT)throw problem(413,'Use the native app to edit this large file.');const current=await readFile(existing.path);if(typeof data.hash!=='string'||sha(current)!==data.hash)throw problem(409,'This file changed outside the editor. Reload it before saving to avoid overwriting newer changes.');}
   let target,url;
   if(existing&&!existing.uploaded){target=existing.path;url=existing.url;}
   else{const copy=await editedTarget(data.name||existing?.name||'edited.txt');target=copy.target;url=copy.url;}
   const temporary=target+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,target);}catch(e){await unlink(temporary).catch(()=>{});throw e;}
   return {saved:true,url,name:path.basename(target),size:bytes.length,hash:sha(bytes),copied:!existing||existing.uploaded};
  }finally{locks.delete(key);}
 }
 async function content(ref,req,res){
  const file=await resolve(ref),info=await stat(file.path),ext=path.extname(file.name).slice(1).toLowerCase(),headers={'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Accept-Ranges':'bytes','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"};
  if(ext==='pdf')headers['Content-Security-Policy']="frame-ancestors 'self'";
  let start=0,end=info.size-1,status=200;if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!m||(!m[1]&&!m[2]))throw problem(416,'Invalid byte range.');if(!m[1])start=Math.max(0,info.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size)throw problem(416,'Range is outside this file.');status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;}
  headers['Content-Length']=String(Math.max(0,end-start+1));res.writeHead(status,headers);if(!info.size){res.end();return;}const stream=createReadStream(file.path,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }
 async function openNative(ref){let file=await resolve(ref);const ext=path.extname(file.name).slice(1);if(!TEXT.test(ext)&&!nativeDocs.test(file.name))throw problem(400,'No safe desktop opener is configured for this format. Download it and choose an app.');if(file.uploaded){const copy=await editedTarget(file.name);await copyFile(file.path,copy.target);file={path:copy.target,url:copy.url,name:copy.name};}if(opener)await opener(file.path,TEXT.test(ext));else await new Promise((resolve,reject)=>{let command,args;if(process.platform==='win32'){command=TEXT.test(ext)?'notepad.exe':'rundll32.exe';args=TEXT.test(ext)?[file.path]:['url.dll,FileProtocolHandler',file.path];}else{command=process.platform==='darwin'?'open':'xdg-open';args=process.platform==='darwin'&&TEXT.test(ext)?['-e',file.path]:[file.path];}const child=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:false});child.once('error',()=>reject(problem(400,'The desktop app could not open this file. Download it and choose an app.')));child.once('spawn',()=>{child.unref();resolve();});});return {opened:true,...(file.url?{url:file.url,name:file.name}:{})};}
 return {inspect,save,content,openNative,async reference(ref){const file=await resolve(ref);return {name:file.name,path:path.relative(filesRoot,file.path).split(path.sep).join('/'),bytes:(await stat(file.path)).size};}};
}
