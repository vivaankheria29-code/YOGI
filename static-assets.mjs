import {stat,readFile} from 'node:fs/promises';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
import path from 'node:path';
const compress=promisify(gzip);
export function createStaticAssets(root){
 const cache=new Map();let used=0;const maxBytes=16*1024*1024;
 return async function serve(req,res,file,type){
  const target=path.resolve(root,'public',file),base=path.resolve(root,'public');
  if(!target.startsWith(base+path.sep))throw Object.assign(new Error('Not found.'),{status:404});
  const info=await stat(target,{bigint:true});if(!info.isFile())throw Object.assign(new Error('Not found.'),{status:404});
  const stamp=`${info.mtimeNs}-${info.ctimeNs}-${info.size}`,tag=`W/"${stamp}"`;
  const headers={'Content-Type':type,'Cache-Control':file.endsWith('.woff2')||file.startsWith('vendor/')?'public, max-age=86400':'no-cache','ETag':tag,'Vary':'Accept-Encoding','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  if((req.headers['if-none-match']||'').split(',').some(x=>x.trim()===tag||x.trim()==='*')){res.writeHead(304,headers);res.end();return;}
  let entry=cache.get(file);
  if(entry?.stamp!==stamp){
   if(entry){used-=entry.bytes||0;cache.delete(file);}
   entry={stamp,bytes:0};cache.set(file,entry);
   entry.ready=(async()=>{const raw=await readFile(target),zipped=raw.length>1024&&/text|javascript|json|svg/.test(type)?await compress(raw):null;entry.bytes=raw.length+(zipped?.length||0);if(cache.get(file)===entry){used+=entry.bytes;while(used>maxBytes&&cache.size){const name=cache.keys().next().value,removed=cache.get(name);used-=removed.bytes;cache.delete(name);}}return {raw,zipped};})().catch(error=>{if(cache.get(file)===entry)cache.delete(file);throw error;});
  }
  const {raw,zipped}=await entry.ready;
  const accept=(req.headers['accept-encoding']||'').split(',').some(x=>/^\s*gzip\s*(;|$)/i.test(x)&&! /;\s*q=0(?:\.0*)?\s*(?:;|$)/i.test(x));
  const data=accept&&zipped?zipped:raw;if(data===zipped)headers['Content-Encoding']='gzip';headers['Content-Length']=String(data.length);
  res.writeHead(200,headers);res.end(data);
 };
}
