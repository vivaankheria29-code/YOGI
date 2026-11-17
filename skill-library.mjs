import {readFileSync,writeFileSync,existsSync,mkdirSync,lstatSync,renameSync,rmSync,realpathSync,statSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function relative(value){
  if(typeof value!=='string'||!value||value.length>600||value.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.')||/[<>:"\\|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part)))throw new Error('Unsafe skill file path.');
  return value;
}
function secureDirectory(base,parts=[]){
  if(lstatSync(base).isSymbolicLink()||!lstatSync(base).isDirectory())throw new Error('Skill destination must be a real directory.');
  let current=base;
  for(const part of parts){current=path.join(current,part);if(!existsSync(current))mkdirSync(current);const stat=lstatSync(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Skill destination contains a link or non-directory.');}
  return current;
}
const catalogCache=new Map();
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export function loadSkillCatalog(root){
  const file=path.resolve(root,'skill-catalog.json'),stat=statSync(file,{bigint:true}),key=`${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}:${stat.ino}`;
  const cached=catalogCache.get(file);if(cached?.key===key)return cached.catalog;
  const catalog=JSON.parse(readFileSync(file,'utf8'));
  if(catalog.format!==1||!Number.isInteger(catalog.count)||catalog.count<1||catalog.count>10000||catalog.skills?.length!==catalog.count||!/^[a-f0-9]{64}$/.test(catalog.packSha256))throw new Error('Invalid development skill catalog.');
  const names=new Set();
  for(const skill of catalog.skills){
    if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(skill.name)||names.has(skill.name)||!Array.isArray(skill.files)||skill.files.length>500)throw new Error('Invalid skill identity.');
    if(skill.storage!==undefined&&skill.storage!=='on-demand')throw new Error('Invalid skill storage.');
    names.add(skill.name);const paths=new Set();
    for(const file of skill.files){relative(file.path);if(paths.has(file.path)||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isInteger(file.bytes)||file.bytes<0||file.bytes>2*1024**2)throw new Error('Invalid skill file manifest.');paths.add(file.path);}
    if(!paths.has('SKILL.md'))throw new Error('Skill instructions are missing.');
  }
  if(catalogCache.size>=8)catalogCache.delete(catalogCache.keys().next().value);catalogCache.set(file,{key,catalog:freeze(catalog)});
  return catalog;
}
function safeFile(base,file){
  const parts=relative(file).split('/'),name=parts.pop();
  let current=base;
  for(const part of parts){current=path.join(current,part);if(existsSync(current)&&(lstatSync(current).isSymbolicLink()||!lstatSync(current).isDirectory()))throw new Error('Linked skill paths are not allowed.');}
  const target=path.join(current,name);
  const stat=lstatSync(target,{throwIfNoEntry:false});
  if(stat&&(stat.isSymbolicLink()||!stat.isFile()))throw new Error('Skill files must be regular files.');
  return target;
}
export function installBundledSkills(root,{log=()=>{}}={}){
  root=realpathSync(root);const catalog=loadSkillCatalog(root);
  const workspace=secureDirectory(root,['workspace']);
  let decoded;const payload=()=>{
    if(decoded)return decoded;
    const packed=readFileSync(path.join(root,'skills-pack.json.gz'));
    if(digest(packed)!==catalog.packSha256)throw new Error('Skill pack integrity check failed.');
    const data=JSON.parse(gunzipSync(packed,{maxOutputLength:64*1024**2}));
    if(data.format!==1||data.skills?.length!==catalog.count)throw new Error('Invalid skill pack.');
    decoded=new Map();
    for(const item of data.skills){if(decoded.has(item.name))throw new Error('Duplicate packed skill.');decoded.set(item.name,item);}
    // Check every payload before any skill files are installed.
    for(const skill of catalog.skills){const item=decoded.get(skill.name);if(item?.files?.length!==skill.files.length)throw new Error('Skill file count mismatch.');const files=new Map();for(const file of item.files){relative(file.path);if(files.has(file.path))throw new Error('Duplicate packed path.');files.set(file.path,Buffer.from(file.data,'base64'));}for(const expected of skill.files){const bytes=files.get(expected.path);if(!bytes||bytes.length!==expected.bytes||digest(bytes)!==expected.sha256)throw new Error('Skill content integrity check failed.');}item.contents=files;}
    return decoded;
  };
  let installed=0,cached=0;const conflicts=[];
  for(const skill of catalog.skills){
    const skillsRoot=secureDirectory(workspace,skill.storage==='on-demand'?['.yogi','skills']:['.agents','skills']);
    const dest=path.join(skillsRoot,skill.name);
    if(existsSync(dest)){
      secureDirectory(skillsRoot,[skill.name]);const receipt=path.join(dest,'.yogi-managed.json');let owned;
      if(existsSync(receipt)&&!lstatSync(receipt).isSymbolicLink())try{owned=JSON.parse(readFileSync(receipt,'utf8'));}catch{}
      if(!owned?.version||owned.source!==skill.sourceUrl){conflicts.push(skill.name);continue;}
      let changed=false,missing=false;
      for(const file of skill.files){const target=safeFile(dest,file.path);if(!existsSync(target))missing=true;else if(digest(readFileSync(target))!==file.sha256)changed=true;}
      if(changed){conflicts.push(skill.name);continue;}
      if(!missing){if(owned.version!==catalog.version)writeFileSync(receipt,JSON.stringify({version:catalog.version,source:skill.sourceUrl}));cached++;continue;}
      const item=payload().get(skill.name);
      for(const file of skill.files){const target=safeFile(dest,file.path);if(!existsSync(target)){secureDirectory(dest,file.path.split('/').slice(0,-1));writeFileSync(target,item.contents.get(file.path),{flag:'wx',mode:file.executable?0o755:0o644});}}
      writeFileSync(receipt,JSON.stringify({version:catalog.version,source:skill.sourceUrl}));installed++;continue;
    }
    const item=payload().get(skill.name),stage=path.join(skillsRoot,'.yogi-stage-'+randomUUID());mkdirSync(stage);
    try{
      for(const file of skill.files){secureDirectory(stage,file.path.split('/').slice(0,-1));writeFileSync(path.join(stage,...file.path.split('/')),item.contents.get(file.path),{flag:'wx',mode:file.executable?0o755:0o644});}
      writeFileSync(path.join(stage,'.yogi-managed.json'),JSON.stringify({version:catalog.version,source:skill.sourceUrl}));
      renameSync(stage,dest);installed++;
    }finally{if(existsSync(stage)&&path.dirname(stage)===skillsRoot&&path.basename(stage).startsWith('.yogi-stage-'))rmSync(stage,{recursive:true});}
  }
  const state={version:catalog.version,total:catalog.count,installed:installed+cached,newlyInstalled:installed,cached,conflicts,categories:catalog.categories};
  writeFileSync(safeFile(workspace,'yogi-skills-status.json'),JSON.stringify(state,null,2));
  log(`Development skills: ${state.installed}/${catalog.count} ready (${installed} installed, ${cached} reused).`);
  return state;
}
export function skillStatus(root){
  try{return JSON.parse(readFileSync(path.join(root,'workspace/yogi-skills-status.json'),'utf8'));}catch{const catalog=loadSkillCatalog(root);return {total:catalog.count,installed:0,conflicts:[],categories:catalog.categories};}
}
export function searchSkills(root,{query='',category='',offset=0,limit=20}={}){
  const catalog=loadSkillCatalog(root),words=String(query).toLowerCase().slice(0,200).match(/[\p{L}\p{N}+#.]+/gu)||[];
  const found=catalog.skills.filter(s=>!category||s.category===category).map(s=>{const name=s.name.replace(/-/g,' '),text=(s.name+' '+s.description).toLowerCase();return {skill:s,score:words.reduce((n,w)=>n+(name.includes(w)?4:text.includes(w)?1:0),0)};}).filter(s=>!words.length||s.score>0).sort((a,b)=>b.score-a.score||a.skill.name.localeCompare(b.skill.name));
  offset=Math.max(0,Math.trunc(Number(offset))||0);limit=Math.max(1,Math.min(20,Math.trunc(Number(limit))||20));
  return {total:found.length,offset,skills:found.slice(offset,offset+limit).map(({skill:s})=>({name:s.name,description:s.description,category:s.category,sourceUrl:s.sourceUrl,license:s.license,provenance:s.provenance||'github',sourceLabel:s.provenance==='yogi-authored'?'API reference':'GitHub source',path:(s.storage==='on-demand'?'.yogi':'.agents')+'/skills/'+s.name+'/SKILL.md'}))};
}
export const developmentSkillTool={type:'function',name:'yogi_development_skills',description:'Find and read YOGI’s installed frontend, backend, video animation, and 3D website skill library. Search by task or framework, then read one relevant skill and its supporting text files. Does not execute any code.',inputSchema:{type:'object',properties:{query:{type:'string'},name:{type:'string',description:'Exact skill name returned by search.'},file:{type:'string',description:'Relative file inside that skill. Defaults to SKILL.md.'}},additionalProperties:false}};
export function useDevelopmentSkill(root,args={}){
  if(!args.name)return searchSkills(root,{query:args.query||'',limit:8});
  const catalog=loadSkillCatalog(root),skill=catalog.skills.find(s=>s.name===args.name);if(!skill)throw new Error('Skill is not in the bundled catalog.');
  const file=args.file||'SKILL.md';if(!skill.files.some(f=>f.path===file))throw new Error('File is not in this skill manifest.');
  const base=secureDirectory(path.join(root,'workspace'),[skill.storage==='on-demand'?'.yogi':'.agents','skills',skill.name]),target=safeFile(base,file);
  const bytes=readFileSync(target);if(bytes.length>90000)throw new Error('Skill file is too large to load into a turn.');if(bytes.includes(0))throw new Error('This resource is binary; inspect it with the appropriate image or file tool.');
  return {name:skill.name,source:skill.sourceUrl,file,text:bytes.toString('utf8'),files:skill.files.map(f=>f.path)};
}
