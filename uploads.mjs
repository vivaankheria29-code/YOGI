import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink, realpath, stat, rmdir } from 'node:fs/promises';
import path from 'node:path';

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_FILES = 10;
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const invalid = message => Object.assign(new Error(message), {status:400});
export function safeFilename(name) {
  let result = String(name || 'attachment').split(/[\\/]/).pop().replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/[ .]+$/g, '');
  if (!result || /^\.+$/.test(result)) result = 'attachment';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) result = '_' + result;
  // Keep the extension while limiting the Windows path component length.
  if (result.length > 140) { const ext = path.extname(result).slice(0,24); result = result.slice(0,140-ext.length) + ext; }
  return result;
}
function inside(parent, target) {const relative = path.relative(parent,target);return relative !== '..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);}
export async function createUploads(workspace, dataDir, {maxStoredBytes = 2 * 1024 ** 3} = {}) {
  const directory = path.join(workspace,'uploads');
  await mkdir(directory,{recursive:true});
  const workspaceReal = await realpath(workspace), directoryReal = await realpath(directory);
  if (!inside(workspaceReal,directoryReal)) throw new Error('The uploads directory must be inside the workspace.');
  const metadataFile = path.join(dataDir,'uploads.json');
  let records = {};
  try {records = JSON.parse(await readFile(metadataFile,'utf8'));} catch(e) {if(e.code !== 'ENOENT') throw e;}
  let saveChain = Promise.resolve(), reservedBytes = 0;
  const storedBytes = () => Object.values(records).reduce((sum, record) => sum + (Number(record.size)||0), 0);
  async function persist() {
    const snapshot = JSON.stringify(records,null,2);
    saveChain = saveChain.catch(()=>{}).then(async()=>{const tmp=metadataFile+'.tmp';await writeFile(tmp,snapshot);await rename(tmp,metadataFile);});
    return saveChain;
  }
  return {
    list(chatId) {
      return {usedBytes:storedBytes(),maxStoredBytes,files:Object.values(records).filter(r=>!chatId||r.chatId===chatId).map(({id,chatId,name,size,createdAt})=>({id,chatId,name,size,createdAt}))};
    },
    async remove(chatId,id) {
      const record=Object.hasOwn(records,id)&&records[id];
      if(!record || record.chatId!==chatId || !uuid.test(id))throw invalid('This saved file is not available in this conversation.');
      let target;
      try { target=await realpath(record.path); } catch(error) { if(error.code!=='ENOENT')throw error; }
      if(target) {
        const folder=await realpath(path.join(directoryReal,id));
        if(!inside(directoryReal,target)||!inside(folder,target))throw invalid('This file is outside the uploads folder.');
        await unlink(target);await rmdir(folder).catch(()=>{});
      }
      delete records[id];await persist();
    },
    async receive(req, chatId, originalName) {
      if (!uuid.test(chatId || '')) throw invalid('A valid conversation is required for an upload.');
      if (typeof originalName !== 'string' || !originalName || originalName.length > 1024) throw invalid('A filename is required (up to 1,024 characters).');
      const length = req.headers['content-length'];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length)>MAX_FILE_BYTES)) {req.resume();throw Object.assign(new Error('Files can be up to 100 MB each.'),{status:413});}
      const reservation = length === undefined ? MAX_FILE_BYTES : Number(length);
      if(storedBytes()+reservedBytes+reservation>maxStoredBytes){req.resume();throw Object.assign(new Error('Saved uploads reached the 2 GB quota. Delete files in Settings > Saved files before uploading more.'),{status:507});}
      reservedBytes+=reservation;
      try {
      const id = randomUUID(), name = safeFilename(originalName), folder = path.join(directoryReal,id);
      await mkdir(folder);
      const filename = path.join(folder,name), handle = await open(filename,'wx');
      let size=0,tooLarge=false,failed;
      try {
        for await (const chunk of req) {
          size+=chunk.length;
          if (size>MAX_FILE_BYTES) {tooLarge=true;continue;}
          await handle.writeFile(chunk);
        }
        if (tooLarge) throw Object.assign(new Error('Files can be up to 100 MB each.'),{status:413});
      } catch(e) {failed=e;} finally {await handle.close();}
      if (failed) {await unlink(filename).catch(()=>{});await rmdir(folder).catch(()=>{});throw failed;}
      const header=await open(filename,'r');let bytes=Buffer.alloc(12);try{await header.read(bytes,0,12,0);}finally{await header.close();}
      const image = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.subarray(0,3).equals(Buffer.from([255,216,255])) || (bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP');
      const record={id,chatId,name,size,path:filename,image,createdAt:Date.now()};records[id]=record;
      try{await persist();}catch(error){delete records[id];await unlink(filename).catch(()=>{});await rmdir(folder).catch(()=>{});throw error;}
      return {id,name,size,image,chatId};
      } finally {reservedBytes-=reservation;}
    },
    async resolve(chatId, ids=[]) {
      if (!Array.isArray(ids) || ids.length>MAX_FILES || ids.some(id=>typeof id!=='string') || new Set(ids).size!==ids.length) throw invalid('Attach up to 10 different files per message.');
      const files=[];
      for(const id of ids) {
        const record=Object.hasOwn(records,id) && records[id];
        if (!record || record.chatId!==chatId) throw invalid('An attachment is missing or belongs to another conversation. Please attach it again.');
        let resolved, info;try{resolved=await realpath(record.path);info=await stat(resolved);}catch{throw invalid('An attached file is no longer available. Please attach it again.');}
        if (!inside(directoryReal,resolved) || !info.isFile() || info.size>MAX_FILE_BYTES) throw invalid('An attached file is no longer valid. Please attach it again.');
        files.push({...record,path:resolved,size:info.size});
      }
      if(files.reduce((n,f)=>n+f.size,0)>MAX_TOTAL_BYTES)throw invalid('Attachments can total up to 500 MB per message.');
      return files;
    }
  };
}
