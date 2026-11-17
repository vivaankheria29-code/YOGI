import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
let shipped=0;
for(const line of readFileSync(path.join(root,'SHA256SUMS.txt'),'utf8').trim().split(/\r?\n/)){
  const [digest,name]=line.split('  ');assert.ok(name&&!name.split('/').includes('..'));
  assert.equal(sha(readFileSync(path.join(root,name))),digest,`Shipped file changed: ${name}`);shipped++;
}
const catalog=JSON.parse(readFileSync(path.join(root,'skill-catalog.json'),'utf8'));
const packed=readFileSync(path.join(root,'skills-pack.json.gz'));assert.equal(sha(packed),catalog.packSha256);
const pack=JSON.parse(gunzipSync(packed,{maxOutputLength:64*1024**2}));
assert.equal(pack.skills.length,catalog.count);assert.equal(catalog.skills.length,catalog.count);
const entries=new Map(pack.skills.map(s=>[s.name,s]));assert.equal(entries.size,catalog.count);
for(const skill of catalog.skills){const item=entries.get(skill.name);assert.ok(item);assert.equal(item.files.length,skill.files.length);const files=new Map(item.files.map(f=>[f.path,Buffer.from(f.data,'base64')]));assert.equal(files.size,item.files.length);for(const expected of skill.files){const bytes=files.get(expected.path);assert.ok(bytes);assert.equal(bytes.length,expected.bytes);assert.equal(sha(bytes),expected.sha256);}}
let syntax=0;
function check(folder){for(const item of readdirSync(folder,{withFileTypes:true})){if(item.name.startsWith('.')||['node_modules','workspace','data','work'].includes(item.name))continue;const file=path.join(folder,item.name);if(item.isDirectory())check(file);else if(/\.(?:mjs|js)$/.test(item.name)){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);syntax++;}}}
check(root);
console.log(`Verified ${shipped} shipped files, ${catalog.count} skill manifests, and ${syntax} JavaScript files.`);
