import {realpathSync,statSync,readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';

export const artifactTool={type:'function',name:'jarvis_inspect_file',description:'Read saved YOGI files without the shell. List directories, read UTF-8 text, inspect file metadata and PNG integrity, or preview a PNG. Accepts paths relative to files/, files/-prefixed paths, local download URLs, or absolute paths inside files/. For email attachments use jarvis_email_local_files: it loads binary data on the server without copying it into chat.',inputSchema:{type:'object',properties:{path:{type:'string',description:'Saved artifact path. Empty string lists files/.'},preview:{type:'boolean',description:'View a verified PNG image when image viewing or verification is requested.'},offset:{type:'integer',minimum:0,description:'UTF-8 text byte offset; defaults to 0.'}},required:['path'],additionalProperties:false}};
export function resolveArtifact(workspace,input){
  if(typeof input!=='string'||input.length>2000)throw new Error('A saved artifact path is required.');
  const root=realpathSync(path.join(workspace,'files'));let requested=input;
  if(/^https?:\/\//i.test(requested)){
    const url=new URL(requested);
    if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||url.port!==String(process.env.PORT||8341)||!url.pathname.startsWith('/files/')||url.username||url.password||url.search||url.hash)throw new Error('Only local YOGI download URLs are supported.');
    requested=decodeURIComponent(url.pathname.slice(7));
  }else if(/^files(?:[\\/]|$)/i.test(requested))requested=requested.replace(/^files(?:[\\/]|$)/i,'');
  if(requested.split(/[\\/]/).some(part=>part==='..'||part.startsWith('.')))throw new Error('Hidden files and traversal are not allowed.');
  const candidate=path.resolve(root,requested),relative=path.relative(root,candidate);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||relative.split(/[\\/]/).some(part=>part.includes(':')))throw new Error('Path is outside files/.');
  const target=realpathSync(candidate),within=path.relative(root,target);
  if(within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within)||within.split(/[\\/]/).some(part=>part.startsWith('.')))throw new Error('Path is outside readable artifacts.');
  return {target,within};
}
export function readArtifactBytes(workspace,input){
  const resolved=resolveArtifact(workspace,input),stat=statSync(resolved.target);
  if(!stat.isFile()||stat.size>50*1024*1024)throw new Error('Reading supports files up to 50 MiB.');
  return {...resolved,bytes:readFileSync(resolved.target)};
}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function pngInfo(bytes){
  if(!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw new Error('Invalid PNG signature.');
  let offset=8,width,height,ended=false,first=true;const compressed=[];
  while(offset<bytes.length){
    if(offset+12>bytes.length)throw new Error('Truncated PNG chunk.');
    const size=bytes.readUInt32BE(offset),end=offset+12+size;
    if(end>bytes.length)throw new Error('Truncated PNG data.');
    const kind=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,end-4);
    if(crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))throw new Error('PNG checksum failed.');
    if(first&&(kind!=='IHDR'||size!==13))throw new Error('Invalid PNG header.');
    if(kind==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);if(!width||!height||width*height>40_000_000)throw new Error('PNG dimensions exceed inspection limits.');}
    if(kind==='IDAT')compressed.push(data);
    if(kind==='IEND'){ended=true;if(size!==0||end!==bytes.length)throw new Error('Invalid PNG ending.');}
    first=false;offset=end;
  }
  if(!ended||!compressed.length)throw new Error('Incomplete PNG.');
  const decoded=inflateSync(Buffer.concat(compressed),{maxOutputLength:200*1024*1024});
  if(!decoded.length)throw new Error('Empty PNG data.');
  return {format:'PNG',width,height,integrity:'Signature, chunk checksums and compressed image data verified'};
}
export function inspectArtifact(workspace,args){
  try{
    const {target,within}=resolveArtifact(workspace,args?.path),relative=within.split(path.sep).join('/');
    const stat=statSync(target);let result;const contentItems=[];
    if(stat.isDirectory()){
      if(args.preview)throw new Error('Choose an image file to preview.');
      const entries=readdirSync(target,{withFileTypes:true}).filter(entry=>!entry.name.startsWith('.')&&!entry.isSymbolicLink()).slice(0,100).map(entry=>({name:entry.name,kind:entry.isDirectory()?'directory':'file'}));
      result={path:relative,entries};
    }else{
      if(!stat.isFile()||stat.size>50*1024*1024)throw new Error('Inspection supports files up to 50 MiB.');
      const bytes=readFileSync(target),isPng=path.extname(target).toLowerCase()==='.png';
      result={path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),downloadUrl:`http://localhost:${process.env.PORT||8341}/files/`+within.split(path.sep).map(encodeURIComponent).join('/')};
      if(isPng)Object.assign(result,pngInfo(bytes));
      if(/\.(txt|md|json|csv|tsv|html|css|js|mjs|py|log|xml|yaml|yml)$/i.test(target)){
        const offset=args.offset??0;if(!Number.isSafeInteger(offset)||offset<0||offset>bytes.length)throw new Error('Invalid text offset.');
        let end=Math.min(bytes.length,offset+32768);
        // Avoid splitting a UTF-8 character across consecutive reads.
        if(end<bytes.length)while(end>offset&&(bytes[end]&0xc0)===0x80)end--;
        result.text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(offset,end));result.truncated=end<bytes.length;result.nextOffset=result.truncated?end:null;
      }
      if(args.preview){if(!isPng||bytes.length>10*1024*1024)throw new Error('Preview supports verified PNG images up to 10 MiB.');contentItems.push({type:'inputImage',imageUrl:'data:image/png;base64,'+bytes.toString('base64')});}
    }
    contentItems.unshift({type:'inputText',text:JSON.stringify(result)});
    return {success:true,contentItems};
  }catch(error){return {success:false,contentItems:[{type:'inputText',text:error.code==='ENOENT'?'Saved artifact not found.':error.code==='EACCES'?'Saved artifact is not readable.':error.message}]};}
}
