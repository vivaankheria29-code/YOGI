// Attachment previews, in the style people know from ChatGPT and Claude:
// images as square thumbnails, everything else as a card with a coloured type
// tile, name and size. Any card opens a full preview.
const gsap = window.gsap;
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

const TYPES = [
  {test: /^(pdf)$/, label: 'PDF', name: 'PDF', color: '#D71921'},
  {test: /^(docx?|odt|rtf|pages)$/, label: 'DOC', name: 'Document', color: '#2B2B2B'},
  {test: /^(xlsx?|ods|numbers)$/, label: 'XLS', name: 'Spreadsheet', color: '#2B2B2B'},
  {test: /^(csv|tsv)$/, label: 'CSV', name: 'Table', color: '#2B2B2B'},
  {test: /^(pptx?|odp|key)$/, label: 'PPT', name: 'Slides', color: '#2B2B2B'},
  {test: /^(zip|rar|7z|tar|gz|tgz)$/, label: 'ZIP', name: 'Archive', color: '#2B2B2B'},
  {test: /^(mp3|wav|m4a|ogg|flac|aac)$/, label: 'AUD', name: 'Audio', color: '#2B2B2B'},
  {test: /^(mp4|mov|webm|mkv|avi)$/, label: 'VID', name: 'Video', color: '#2B2B2B'},
  {test: /^(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/, label: 'IMG', name: 'Image', color: '#2B2B2B'},
  {test: /^(js|mjs|ts|tsx|jsx|py|java|c|cc|cpp|h|cs|go|rs|rb|php|swift|kt|sh|ps1|sql|html|css|scss|json|xml|yaml|yml|toml)$/, label: '</>', name: 'Code', color: '#2B2B2B'},
  {test: /^(md|markdown|txt|log|ini|env)$/, label: 'TXT', name: 'Text', color: '#2B2B2B'},
];
const TEXT_EXT = /^(md|markdown|txt|log|ini|csv|tsv|js|mjs|ts|tsx|jsx|py|java|c|cc|cpp|h|cs|go|rs|rb|php|swift|kt|sh|ps1|sql|html|css|scss|json|xml|yaml|yml|toml)$/;

export const extOf = name => (String(name).match(/\.([a-z0-9]{1,6})$/i)?.[1] || '').toLowerCase();
export function typeOf(name, mime = '') {
  const ext = extOf(name);
  const hit = TYPES.find(t => t.test.test(ext));
  if (hit) return hit;
  if (mime.startsWith('image/')) return TYPES.find(t => t.label === 'IMG');
  if (mime.startsWith('text/')) return TYPES.find(t => t.label === 'TXT');
  return {label: (ext || 'FILE').slice(0, 4).toUpperCase(), name: 'File', color: '#2B2B2B'};
}
export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 ** 2) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB';
  return (n / 1024 ** 3).toFixed(1) + ' GB';
}
export const isImage = file => /^image\/(png|jpe?g|gif|webp|bmp|avif|svg\+xml)$/.test(file.type) || /^(png|jpe?g|gif|webp|bmp|avif)$/.test(extOf(file.name));

// Small JPEG thumbnail kept with the saved message so history still shows the picture.
export async function makeThumb(file, size = 264) {
  if (!isImage(file) || file.size > 40 * 1024 * 1024) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = size / Math.min(bitmap.width, bitmap.height);
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = Object.assign(document.createElement('canvas'), {width: size, height: size});
    canvas.getContext('2d').drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', .72);
  } catch { return null; }
}

// Builds one card. `item` = {name, size, type, thumb, file?}
export function fileCard(item, {onOpen, onRemove, progress} = {}) {
  const slot = el('div', 'slot');
  let card;
  if (item.thumb) {
    card = el('button', 'thumb-card');
    const img = el('img'); img.src = item.thumb; img.alt = ''; card.append(img);
  } else {
    card = el('button', 'file-card');
    const t = typeOf(item.name, item.type);
    const tile = el('span', 'file-type', t.label); tile.style.setProperty('--tc', t.color); tile.setAttribute('aria-hidden', 'true');
    const info = el('span', 'file-info');
    info.append(el('span', 'file-name', item.name), el('span', 'file-meta', [t.name, formatBytes(item.size)].filter(Boolean).join(' · ')));
    if (item.snippet) info.append(el('span', 'snippet', item.snippet));
    card.append(tile, info);
  }
  card.type = 'button';
  card.setAttribute('aria-label', `Preview ${item.name}, ${formatBytes(item.size)}`);
  card.onclick = () => onOpen?.(item);
  slot.append(card);
  if (onRemove) {
    const remove = el('button', 'remove'); remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove ' + item.name);
    remove.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2L2 10" fill="none" stroke-width="2" stroke-linecap="round"/></svg>';
    remove.onclick = e => { e.stopPropagation(); onRemove(item); };
    slot.append(remove);
  }
  if (progress) {
    const bar = el('span', 'upload-bar'); const fill = el('i'); bar.append(fill); bar.hidden = true; slot.append(bar);
    slot.setProgress = v => { bar.hidden = v == null; fill.style.transform = `scaleX(${Math.max(.02, v || 0)})`; };
  }
  return slot;
}

export function animateIn(nodes) {
  if (!gsap || document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.from(nodes, {opacity: 0, scale: .9, y: 6, duration: .3, ease: 'back.out(1.8)', stagger: .04});
}

// ---------- Full preview dialog ----------
let workspaceHandler=null;
export function setFileWorkspaceHandler(handler){workspaceHandler=handler;}
let currentUrl = null;
export async function openPreview(item) {
  if(workspaceHandler)return workspaceHandler(item);
  const dialog = $('#previewDialog'), body = $('#previewBody');
  if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
  body.replaceChildren();
  const t = typeOf(item.name, item.type);
  $('#previewTitle').textContent = item.name;
  $('#previewMeta').textContent = [t.name, formatBytes(item.size)].filter(Boolean).join(' · ');
  const file = item.file;
  const ext = extOf(item.name);
  if (item.url) {
    const img = el('img'); img.src = item.url; img.alt = item.name || 'Image'; body.append(img);
    const a = el('a', null, 'Download this image'); a.href = item.url + '?download=1'; a.className = 'preview-download'; body.append(a);
    $('#previewMeta').textContent = 'Image';
  } else if (file && isImage(file)) {
    currentUrl = URL.createObjectURL(file);
    const img = el('img'); img.src = currentUrl; img.alt = item.name; body.append(img);
  } else if (!file && item.thumb) {
    const img = el('img'); img.src = item.thumb; img.alt = item.name; body.append(img);
    body.append(el('p', 'preview-empty', 'This is the saved thumbnail. The original file was sent with the message.'));
  } else if (file && (file.type === 'application/pdf' || ext === 'pdf')) {
    currentUrl = URL.createObjectURL(new Blob([file], {type: 'application/pdf'}));
    const frame = el('iframe'); frame.src = currentUrl; frame.title = item.name; body.append(frame);
  } else if (file && (file.type.startsWith('text/') || TEXT_EXT.test(ext) || file.type === 'application/json')) {
    const text = await file.slice(0, 400 * 1024).text();
    const pre = el('pre'); pre.textContent = text + (file.size > 400 * 1024 ? '\n\n… preview shows the first 400 KB' : ''); body.append(pre);
  } else if (file && (file.type.startsWith('video/') || /^(mp4|webm|mov)$/.test(ext))) {
    currentUrl = URL.createObjectURL(file);
    const v = el('video'); v.src = currentUrl; v.controls = true; body.append(v);
  } else if (file && (file.type.startsWith('audio/') || /^(mp3|wav|m4a|ogg)$/.test(ext))) {
    currentUrl = URL.createObjectURL(file);
    const a = el('audio'); a.src = currentUrl; a.controls = true; body.append(a);
  } else {
    body.append(el('p', 'preview-empty', file ? 'There is no preview for this kind of file, but YOGI can still read it.' : 'This file was sent with the message. Attach it again to preview it.'));
  }
  if (!dialog.open) dialog.showModal();
}
export function initPreview() {
  const dialog = $('#previewDialog');
  $('#previewClose').onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { $('#previewBody').replaceChildren(); if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; } });
}

// First line of a text file, shown on its card like Claude does for pasted text.
export async function textSnippet(file) {
  if (!(file.type.startsWith('text/') || TEXT_EXT.test(extOf(file.name)))) return '';
  try { return (await file.slice(0, 600).text()).split('\n').find(l => l.trim())?.trim().slice(0, 80) || ''; } catch { return ''; }
}
