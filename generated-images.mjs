// Finds images YOGI creates during a reply so the chat can show them.
// Two routes, because the engine can make an image in more than one way:
//  1. image data or image paths inside a completed engine item (an image
//     generation tool result, for example), saved into files/generated/;
//  2. new or changed image files in the workspace after the turn (an image
//     made by a skill, a script or a shell command).
import {readdirSync, statSync, mkdirSync, writeFileSync, copyFileSync, existsSync, realpathSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
const MAX_FILES = 6000;

function walk(dir, out, depth = 0) {
  if (depth > 6 || out.size > MAX_FILES) return;
  let entries;
  try { entries = readdirSync(dir, {withFileTypes: true}); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'uploads') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, depth + 1);
    else if (IMAGE_EXT.test(entry.name)) { try { const s = statSync(full); out.set(full, s.mtimeMs + ':' + s.size); } catch {} }
  }
}

export function snapshotImages(dirs) {
  const map = new Map();
  for (const dir of dirs) walk(dir, map);
  return map;
}

export function createImageCollector(workspace) {
  const filesRoot = path.join(workspace, 'files');
  const generated = path.join(filesRoot, 'generated');
  const urlFor = file => '/files/' + path.relative(filesRoot, file).split(path.sep).map(encodeURIComponent).join('/');
  const inside = (parent, file) => { const rel = path.relative(parent, file); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); };

  // Brings an image into files/ so the page is allowed to load it.
  function publish(file) {
    let real; try { real = realpathSync(file); } catch { return null; }
    // Tool-returned paths are data, not authorization to read external files.
    let workspaceReal; try { workspaceReal = realpathSync(workspace); } catch { return null; }
    if (!inside(workspaceReal, real)) return null;
    if (inside(realpathSync(filesRoot), real)) return {url: urlFor(real), name: path.basename(real)};
    mkdirSync(generated, {recursive: true});
    const target = path.join(generated, `${Date.now().toString(36)}-${path.basename(real).replace(/[^\w.-]+/g, '_')}`);
    try { copyFileSync(real, target); } catch { return null; }
    return {url: urlFor(target), name: path.basename(real)};
  }

  function saveBase64(data, hint = 'image') {
    let mime = 'png', b64 = data;
    const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/s.exec(data);
    if (m) { mime = m[1].replace('jpeg', 'jpg'); b64 = m[2]; }
    let bytes;
    try { bytes = Buffer.from(b64, 'base64'); } catch { return null; }
    const png = bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!png && !jpg && !webp) return null;
    if (!m) mime = png ? 'png' : jpg ? 'jpg' : 'webp';
    mkdirSync(generated, {recursive: true});
    const file = path.join(generated, `${hint.replace(/[^\w-]+/g, '-').slice(0, 40) || 'image'}-${randomUUID().slice(0, 8)}.${mime}`);
    writeFileSync(file, bytes);
    return {url: urlFor(file), name: path.basename(file)};
  }

  // Looks through an engine item for image data or image file paths.
  function fromItem(item) {
    const found = [];
    const seen = new Set();
    const visit = (value, key = '', depth = 0) => {
      if (depth > 5 || value == null) return;
      if (typeof value === 'string') {
        if (value.length > 800 && (/^data:image\//.test(value) || /^(iVBORw0KGgo|\/9j\/|UklGR)/.test(value))) {
          const saved = saveBase64(value, item.type || 'image'); if (saved && !seen.has(saved.url)) { seen.add(saved.url); found.push(saved); }
        } else if (value.length < 1024 && IMAGE_EXT.test(value) && (path.isAbsolute(value) || /[\\/]/.test(value))) {
          const candidate = path.isAbsolute(value) ? value : path.join(workspace, value);
          if (existsSync(candidate)) { const p = publish(candidate); if (p && !seen.has(p.url)) { seen.add(p.url); found.push(p); } }
        }
        return;
      }
      if (Array.isArray(value)) { value.slice(0, 50).forEach(v => visit(v, key, depth + 1)); return; }
      if (typeof value === 'object') for (const [k, v] of Object.entries(value)) visit(v, k, depth + 1);
    };
    visit(item);
    return found;
  }

  // Images that appeared or changed in the workspace since `before`.
  function newSince(before) {
    const after = snapshotImages([filesRoot, path.join(workspace, 'work')]);
    const out = [];
    for (const [file, stamp] of after) {
      if (before.get(file) === stamp) continue;
      const p = publish(file); if (p) out.push(p);
      if (out.length >= 12) break;
    }
    return out;
  }

  return {snapshot: () => snapshotImages([filesRoot, path.join(workspace, 'work')]), fromItem, newSince};
}
