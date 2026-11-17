import {initEngineSettings} from './engine-settings.js';
import {initFileWorkspace} from './file-workspace.js';
import {initMusicVibe} from './music-vibe.js';
import {initSpotify} from './spotify.js';
import {refreshSkillLibrary} from './skills.js';
import './cursor.js';
import {phaseFromStatus} from './workflow.js';
import {EXPRESSIONS} from './expressions.js';
import {findWakePhrase, setWakeSensitivity} from './wake-word.js';
import {initMotion} from './motion.js';
import {initLooks} from './looks.js';
import {initSlash} from './slash.js';
import {mountGame, startFen} from './chessgame.js';
import {loadWorkspace, saveWorkspace} from './storage.js';
import './core-layout.js';
import {VoicePlayer} from './speech.js';
import {appendImages, renderRich, generatedGallery} from './results.js';
import {PluginPanel, ApprovalPanel} from './plugins.js';
import {Face} from './face.js';
import {WaitingCard} from './waiting.js';
import {fileCard, makeThumb, textSnippet, openPreview, initPreview, setFileWorkspaceHandler, animateIn, isImage} from './attachments.js';

const gsap = window.gsap;
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
const cleanName = v => String(v || '').replace(/[\u0000-\u001f\u007f<>`$\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

const restoredWorkspace = await loadWorkspace();
let saveRevision = 0, unsavedWrites = 0, saveFailed = false;
// ---------- State (storage keys kept from the previous version so nothing is lost) ----------
let userName = ''; try { userName = localStorage.getItem('janmate.userName') || ''; } catch {}
let messages = load('jarvis.messages', []), tasks = restoredWorkspace.state?.tasks || load('jarvis.tasks', []), speaking = load('jarvis.voice', false);
let chats = restoredWorkspace.state?.chats || load('gigga.chats', []), currentChatId = restoredWorkspace.state?.currentChatId || load('gigga.active', null);
let webEnabled = load('jarvis.web', true) !== false, imageMode = false;
let prefs = Object.assign({theme: 'dark', cursor: true, reducedMotion: false, voiceEngine: 'auto', faceStyle: 'auto', expression: '', ui: 'core', wakeSensitivity: 'balanced'}, load('gigga.preferences', {}) || {});
setWakeSensitivity(prefs.wakeSensitivity);
if(prefs.coreLayoutVersion!==3){prefs.faceStyle='auto';prefs.coreLayoutVersion=3;}
// Each interface has its own face unless one is chosen in Settings.
const FACE_FOR_UI = {core: 'dots', glass: 'orb', marigold: 'illustrated'};
const faceStyleNow = () => ['dots', 'orb', 'illustrated'].includes(prefs.faceStyle) ? prefs.faceStyle : FACE_FOR_UI[prefs.ui] || 'dots';
let busy = false, view = 'core', pendingFiles = [], requestController = null, elevenLabsReady = false, connected = false;
let waiting = null, drafts = new Map(), draftNodes = new Map(), lastStatus = '';
let workPhase='thinking', completionState=null, completionStarted=0;
let recognition, listening = false, recognitionActive = false, recognitionStarting = false, acceptResults = false, draftBase = '', restartTimer;
const sentFiles = new Map(); // Stable upload ID -> File; persisted IDs retrieve originals after reload.
if (!Array.isArray(messages)) messages = []; if (!Array.isArray(tasks)) tasks = []; if (!Array.isArray(chats)) chats = [];
if (!chats.some(c => c.id === currentChatId)) {
  currentChatId = crypto.randomUUID();
  chats.unshift({id: currentChatId, title: messages.length ? 'Earlier conversation' : 'New conversation', messages: [...messages], mode: 'General', updatedAt: Date.now()});
} else messages = chats.find(c => c.id === currentChatId).messages || [];

const reduced = () => !!prefs.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;

function save() {
  const chat = chats.find(c => c.id === currentChatId);
  if (chat) {
    chat.messages = [...messages]; chat.mode = $('#workMode').value; chat.updatedAt = Date.now();
    if (!chat.title || chat.title === 'New conversation') chat.title = messages.find(m => m.role === 'user')?.text.slice(0, 70) || 'New conversation';
  }
  const revision = ++saveRevision; unsavedWrites++;
  saveWorkspace({version:1, chats, tasks, currentChatId}).then(() => {
    if (revision === saveRevision) { saveFailed = false; $('#saveWarning').hidden = true; }
    // Remove legacy copies only after the full replacement has committed.
    for (const key of ['gigga.chats','jarvis.messages','jarvis.tasks']) { try { localStorage.removeItem(key); } catch {} }
  }).catch(() => {
    saveFailed = true; $('#saveWarning').hidden = false;
    $('#saveWarningText').textContent = 'Changes are not saved. Keep this tab open, export a backup, then retry saving.';
  }).finally(() => { unsavedWrites--; });
  store('jarvis.voice', speaking);

  renderHistory();
  $('#chatTitle').textContent = chat?.title || 'New conversation';
}

$('#retrySave').onclick = () => save();
window.addEventListener('beforeunload', event => { if (saveFailed || unsavedWrites) { event.preventDefault(); event.returnValue = ''; } });
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.hidden = false;
  if (gsap && !reduced()) gsap.fromTo(t, {y: 12, opacity: 0}, {y: 0, opacity: 1, duration: .25, ease: 'power3.out'});
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.hidden = true, 4000);
}

// ---------- Face and voice ----------
const voice = new VoicePlayer({
  onError: message => toast(message),
  onState: () => { updateAudioReadiness(); updateActivity(); },
  onCaption: caption => showCaption(caption),
  engine: () => prefs.voiceEngine,
  elevenReady: () => elevenLabsReady,
});
function updateAudioReadiness() { $('#enableAudio').hidden = voice.state !== 'blocked'; }
$('#enableAudio').onclick = () => voice.unlock().catch(error => toast(error.message));
const face = new Face({getVoiceLevels: () => voice.levels(), reducedMotion: reduced, style: faceStyleNow});
const motion = initMotion({face});

let captionWords = [], captionProgress = null;
function showCaption(caption) {
  const box = $('#caption');
  captionProgress = caption?.progress || null;
  if (!caption) { box.hidden = true; box.replaceChildren(); captionWords = []; return; }
  box.replaceChildren();
  let offset = 0;
  captionWords = caption.text.split(/(\s+)/).map(part => {
    const node = /\s+/.test(part) ? document.createTextNode(part) : el('span', 'w', part);
    box.append(node);
    const entry = {node, start: offset, end: offset + part.length};
    offset += part.length; return entry;
  }).filter(w => w.node.nodeType === 1);
  captionWords.total = offset;
  box.hidden = false;
}
function paintCaption() {
  if (!captionProgress || !captionWords.length) return;
  const at = Math.min(1, Math.max(0, captionProgress())) * captionWords.total;
  for (const w of captionWords) { w.node.classList.toggle('said', w.end <= at); w.node.classList.toggle('now', w.start <= at && w.end > at); }
}

const COPY = {
  idle: () => ['Ready when you are', 'Press Space or tap my face to talk.'],
  listening: () => ["I'm listening", wakeSession ? 'Ask your question. Pause when finished.' : 'Press Space again when you are done.'],
  thinking: () => ['Getting started', lastStatus || 'Preparing your request.'],
  reading: () => ['Reading', lastStatus || 'Looking through your message or file.'],
  searching: () => ['Searching', lastStatus || 'Looking up information.'],
  reasoning: () => ['Thinking it through', lastStatus || 'Working through your request.'],
  creating: () => ['Creating your image', lastStatus || 'Image generation is in progress.'],
  working: () => ['Working', lastStatus || 'Running the requested task.'],
  usingtool: () => ['Using a connected tool', lastStatus || 'Waiting for its result.'],
  awaiting: () => ['Waiting for you', 'Review the approval or question in the conversation.'],
  success: () => ['Done', 'Your response is ready.'],
  error: () => ['Something went wrong', 'Check the conversation for details and try again.'],
  writing: () => ['Writing my answer', 'Read along as it appears.'],
  preparing: () => ['Finding my voice', 'Getting ready to say it out loud.'],
  speaking: () => ['Speaking', 'Press Esc to stop me.'],
};
let shownActivity = '';
function activity() {
  if (listening) return 'listening';
  if (voice.state === 'speaking') return 'speaking';
  if (voice.state === 'preparing') return 'preparing';
  if (busy) return workPhase;
  if(completionState){if(!completionStarted)completionStarted=performance.now();if(performance.now()-completionStarted<2800)return completionState;completionState=null;completionStarted=0;}
  return 'idle';
}
function updateActivity(force = false) {
  const a = activity();
  const [line, sub] = COPY[a]();
  if ($('#stateSub').textContent !== sub) $('#stateSub').textContent = sub;
  if (a === shownActivity && !force) return;
  shownActivity = a;
  document.body.dataset.activity = a;
  face.setState(a);
  const lineNode = $('#stateLine');
  lineNode.textContent = line;
  if (gsap && !reduced()) {
    if (document.documentElement.dataset.ui === 'core' && window.ScrambleTextPlugin) gsap.to(lineNode, {duration: .55, scrambleText: {text: line, chars: '01/#*+', speed: .6}, overwrite: true});
    else gsap.fromTo(lineNode, {y: 10, opacity: 0, filter: 'blur(4px)'}, {y: 0, opacity: 1, filter: 'blur(0px)', duration: .45, ease: 'power3.out', overwrite: true});
  }
  $('#micLabel').textContent = listening ? 'Stop' : 'Talk';
  $('#mic').setAttribute('aria-pressed', String(listening));
  $('#mic').setAttribute('aria-label', listening ? 'Stop talking' : 'Start talking');
  $('#faceButton').setAttribute('aria-label', listening ? 'Stop talking' : 'Talk to YOGI');
}
let uiTimer;
function refreshUI(){clearTimeout(uiTimer);if(!document.hidden){paintCaption();updateActivity();}uiTimer=setTimeout(refreshUI,document.hidden?1000:captionProgress?50:100);}
refreshUI();document.addEventListener('visibilitychange',refreshUI);

async function voiceToggle() {
  if (speaking) { speaking = false; voice.stop(); }
  else { try { await voice.unlock(); speaking = true; } catch (error) { return toast(error.message); } }
  updateVoice(); save();
  if (speaking && !elevenLabsReady && prefs.voiceEngine !== 'browser') toast('Using the built-in voice. Add an ElevenLabs key in Settings for a richer voice.');
}
function updateVoice() {
  $('#speakLabel').textContent = speaking ? 'Voice replies on' : 'Voice replies off';
  $('#speakToggle').setAttribute('aria-pressed', String(speaking));
  $('#speakToggle').setAttribute('aria-label',speaking?'Disable voice replies':'Enable voice replies');
  $('#speakToggle').title=speaking?'Voice replies on':'Voice replies off';
}
$('#speakToggle').onclick = voiceToggle;
document.addEventListener('pointerdown', () => { if (speaking) voice.unlock().catch(() => {}); });

// Speech follows the text as it streams: each finished sentence is queued
// immediately, so YOGI starts talking long before the full reply is done.
const spokenUpTo = new Map();
function speakProgress(itemId, text, final = false) {
  if (!speaking) return;
  const done = spokenUpTo.get(itemId) || '';
  if (!text.startsWith(done)) { if (final && !done) voice.enqueue(text); spokenUpTo.set(itemId, text); return; }
  const rest = text.slice(done.length);
  if (final) { if (rest.trim()) voice.enqueue(rest); spokenUpTo.set(itemId, text); return; }
  const min = done ? 140 : 24;
  let cut = -1;
  for (const m of rest.matchAll(/[.!?](?=["')\]]?\s)|\n\n/g)) if (m.index + 1 >= min) { cut = m.index + 1; if (rest.length - cut < 400) break; }
  if (cut < 0) return;
  const upto = done + rest.slice(0, cut);
  if ((upto.match(/```/g) || []).length % 2) return; // inside a code block
  voice.enqueue(rest.slice(0, cut));
  spokenUpTo.set(itemId, upto);
}

const musicVibe=initMusicVibe({face});
const music=initSpotify();

// ---------- Views ----------
const PANELS = {core:'#corePanel', chat: '#chatPanel', history: '#historyPanel', tasks: '#tasksPanel', apps: '#appsPanel', settings: '#settingsPanel', music:'#musicPanel'};
function setView(next) {
  if (!PANELS[next]) next = 'core';
  view = next;
  if (location.hash.slice(1) !== next) history.replaceState(null, '', next === 'core' ? location.pathname : '#' + next); document.body.dataset.view = next;
  for (const sel of new Set(Object.values(PANELS))) $(sel).hidden = sel !== PANELS[next];
  document.querySelectorAll('.tab').forEach(t => t.dataset.view === next ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current'));
  if (next === 'music') music.refresh();
  if (next === 'apps') pluginPanel.load();
  if (next === 'settings') {refreshSavedFiles();refreshSkillLibrary();engineSettings.refresh();}
  if (next === 'tasks') $('#taskInput').focus();
  if (gsap && !reduced()) gsap.fromTo($(PANELS[next]), {opacity: 0, y: 8}, {opacity: 1, y: 0, duration: .3, ease: 'power3.out'});
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setView(t.dataset.view)));
const approvalPanel = new ApprovalPanel(toast);
const pluginPanel = new PluginPanel(name => { setView('chat'); $('#prompt').value = `Use ${name} to `; resizePrompt(); $('#prompt').focus(); }, {onDraft: text => ask(text), notify: text => toast(text)});
pluginPanel.load();

// ---------- Messages ----------
async function preview(item) {
  try {
    if (item.id && sentFiles.has(item.id)) return openPreview({...item, file:sentFiles.get(item.id)});
    if (item.id && item.chatId) {
      const response = await fetch('/api/uploads/'+encodeURIComponent(item.id)+'/content?chatId='+encodeURIComponent(item.chatId));
      if (!response.ok) { const error=await response.json();throw new Error(error.error || 'The saved file is unavailable.'); }
      const file = new File([await response.blob()],item.name,{type:item.type || 'application/octet-stream'});
      sentFiles.set(item.id,file);return openPreview({...item,file});
    }
    // Older messages can be repaired only when exactly one saved upload matches.
    if (!item.url && !item.file) {
      const response=await fetch('/api/uploads?chatId='+encodeURIComponent(currentChatId));
      if(response.ok){const data=await response.json();const matches=data.files.filter(f=>f.name===item.name&&f.size===item.size);if(matches.length===1){Object.assign(item,{id:matches[0].id,chatId:currentChatId});save();return preview(item);}}
    }
    return openPreview(item);
  } catch(error) { toast(error.message); }
}
function attachmentRow(list) {
  const row = el('div', 'files');
  for (const a of list) row.append(fileCard(a, {onOpen: preview}));
  return row;
}
const wideBoard = matchMedia('(min-width: 1100px)');
wideBoard.addEventListener('change', () => renderMessages());
// The difficulty the user asked for ("difficulty 7", "level 3") sets the engine level.
function levelFrom(index) { for (let i = index; i >= 0; i--) if (messages[i]?.role === 'user') { const m = /(?:difficulty|level)\D{0,3}(\d{1,2})/i.exec(messages[i].text); return m ? Math.min(10, Math.max(1, Number(m[1]))) : 5; } return 5; }
// Messages already on screen are not animated again when the thread re-renders.
const shownMessages = new WeakSet();
function messageNode(msg, seenImages, interactive = false) {
  const li = el('li', 'msg ' + (msg.role === 'user' ? 'user' : msg.role === 'error' ? 'error' : msg.role === 'notice' ? 'notice' : 'assistant'));
  if (shownMessages.has(msg)) li.dataset.rv = 'skip';
  shownMessages.add(msg);
  if (msg.role === 'board') li.classList.add('board');
  if (msg.role !== 'user') li.append(el('span', 'who', msg.role === 'error' ? 'Something went wrong' : msg.role === 'images' ? 'Pictures from Wikimedia Commons' : msg.role === 'generated' ? 'Image' : msg.role === 'board' ? 'Board' : 'YOGI'));
  if (msg.attachments?.length) li.append(attachmentRow(msg.attachments));
  const bubble = el('div', 'bubble');
  if (msg.role === 'assistant') renderRich(bubble, msg.text, {onImage: openPreview, seen: seenImages, hideBoards: true});
  else if (msg.role === 'board') {
    // The live game sits in its own panel on the right on wide screens; the thread keeps a small link to it.
    if (interactive && wideBoard.matches && !msg.inline && !document.body.classList.contains('has-file-workspace')) {
      const side = $('#sideBoard'); side.replaceChildren();
      const head = el('div', 'side-head'); head.append(el('h2', null, 'Chess'));
      const inline = el('button', 'ghost', 'Show in chat'); inline.type = 'button'; inline.onclick = () => { msg.inline = true; save(); renderMessages(); };
      head.append(inline); side.append(head);
      try { mountGame(side, msg, {save, interactive: true}); } catch { return null; }
      side.hidden = false; document.body.classList.add('has-board');
      const link = el('button', 'board-link', '♟  Your chess game is on the right →'); link.type = 'button'; link.onclick = () => side.querySelector('.chess-square')?.focus(); bubble.append(link);
    } else { try { mountGame(bubble, msg, {save, interactive}); } catch { return null; } }
  }
  else if (msg.role === 'generated') { const g = generatedGallery(msg.images || [], {onImage: openPreview, seen: seenImages}); if (!g) return null; bubble.append(g); }
  else bubble.textContent = msg.text;
  if (msg.role === 'images' && Array.isArray(msg.images)) appendImages(bubble, msg.images);
  if (msg.text || ['generated', 'images', 'board'].includes(msg.role)) li.append(bubble);
  return li;
}
function renderMessages() {
  const box = $('#messages'); box.replaceChildren(); draftNodes.clear();
  $('#sideBoard').hidden = true; $('#sideBoard').replaceChildren(); document.body.classList.remove('has-board');
  const seen = new Set();
  // Images already shown inline in a reply are not repeated in the image gallery.
  for (const m of messages) if (m.role === 'assistant') renderRich(document.createElement('div'), m.text, {seen});

  const inlineSeen = new Set();
  // Only the newest board can be played; older positions stay as a record.
  // A chess position in a reply becomes a real game right after it (also repairs older chats).
  const fenAt = messages.findLastIndex(m => m?.role === 'assistant' && /```\s*(fen|chess)\b/i.test(m.text || ''));
  if (fenAt >= 0 && !messages.slice(fenAt + 1).some(m => m?.role === 'board')) {
    const fen = startFen(messages[fenAt].text.split(/```\s*(?:fen|chess)\b/i)[1]);
    if (fen) { messages.splice(fenAt + 1, 0, {role: 'board', text: '', fen, start: fen, moves: [], level: levelFrom(fenAt)}); save(); }
  }
  let lastBoard = -1; messages.forEach((m, i) => { if (m?.role === 'board') lastBoard = i; });
  for (const [index, msg] of messages.entries()) {
    if (!msg || (typeof msg.text !== 'string' && !['generated', 'board'].includes(msg.role))) continue;
    const node = messageNode(msg, msg.role === 'generated' ? new Set(seen) : inlineSeen, index === lastBoard && !busy);
    if (node) box.append(node);
  }
  for (const [id, text] of drafts) paintDraft(id, text);
  if (waiting) box.append(waiting.li);
  $('#welcome').hidden = messages.length > 0 || busy;
  scrollThread(true);
}
function scrollThread(force = false) {
  const t = $('#thread');
  if (force) t.scrollTop = t.scrollHeight;
  else if (t.scrollHeight - t.scrollTop - t.clientHeight < 220) motion.glideTo(t, t.scrollHeight);
}
function paintDraft(id, text) {
  let entry = draftNodes.get(id);
  if (!entry || !entry.li.isConnected) {
    const li = el('li', 'msg assistant streaming'); li.append(el('span', 'who', 'YOGI'));
    const bubble = el('div', 'bubble'); li.append(bubble);
    $('#messages').append(li); entry = {li, bubble}; draftNodes.set(id, entry);
  }
  if(entry.text===text)return;
  entry.text=text;entry.bubble.replaceChildren();
  renderRich(entry.bubble, text, {onImage: openPreview});
  const last = entry.bubble.lastElementChild && !['PRE', 'DIV'].includes(entry.bubble.lastElementChild.tagName) ? entry.bubble.lastElementChild : entry.bubble;
  last.append(el('span', 'caret'));
  scrollThread();
}
let paintFrame = 0;
function scheduleDraftPaint() { if (paintFrame) return; paintFrame = setTimeout(() => { paintFrame = 0; if(!document.hidden)for (const [id, text] of drafts) paintDraft(id, text); }, 33); }

document.addEventListener('visibilitychange',()=>{if(!document.hidden&&drafts.size)scheduleDraftPaint();});

function showWaiting() {
  if (waiting) return;
  const card = new WaitingCard({mode: $('#workMode').value, reduced});
  const li = el('li', 'msg assistant'); li.append(el('span', 'who', 'YOGI'), card.root);
  card.li = li; waiting = card;
  if (lastStatus) card.setStatus(lastStatus);
  $('#messages').append(li); scrollThread(true);
}
function hideWaiting() { if (!waiting) return; waiting.destroy(); waiting.li.remove(); waiting = null; }

// ---------- Search toggles ----------
function updateSearchControls() {$('#webToggle').textContent=webEnabled?'Web on':'Web off';$('#imageToggle').textContent=imageMode?'Images on':'Images';
  $('#webToggle').setAttribute('aria-pressed', String(webEnabled));
  $('#imageToggle').setAttribute('aria-pressed', String(imageMode));
  $('#webToggle').title = webEnabled ? 'Web search is on' : 'Web search is off';
  $('#imageToggle').title = imageMode ? 'Picture search is on' : 'Find pictures from Wikimedia Commons';
}
$('#webToggle').onclick = () => { webEnabled = !webEnabled; if (!webEnabled) imageMode = false; store('jarvis.web', webEnabled); updateSearchControls(); };
$('#imageToggle').onclick = () => { imageMode = !imageMode; if (imageMode) webEnabled = true; updateSearchControls(); };
updateSearchControls();

// ---------- Busy state ----------
function setBusy(value) {
  busy = value;
  $('#stopResponse').hidden = !value; $('#send').hidden = value;
  for (const id of ['#attach', '#fileInput', '#workMode']) $(id).disabled = value;
  $('#composerStatus').textContent = value ? 'Working on it…' : '';
  updateActivity();
}

// ---------- Uploading ----------
function upload(item, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload?chatId=' + encodeURIComponent(currentChatId) + '&name=' + encodeURIComponent(item.name));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = e => { if (e.lengthComputable) item.slot?.setProgress?.(e.loaded / e.total); };
    xhr.onload = () => { let data = {}; try { data = JSON.parse(xhr.responseText); } catch {} xhr.status < 300 ? resolve(data) : reject(new Error(data.error || 'Upload failed.')); };
    xhr.onerror = () => reject(new Error('Upload failed. Check that YOGI is still running.'));
    signal.addEventListener('abort', () => { xhr.abort(); reject(new DOMException('Aborted', 'AbortError')); }, {once: true});
    xhr.send(item.file);
  });
}

// ---------- Asking ----------
async function ask(raw) {
  let message = raw.trim();
  if (busy || (!message && !pendingFiles.length)) return;
  if (!message) message = pendingFiles.length === 1 ? 'Please take a look at this file.' : 'Please take a look at these files.';
  const preservedDraft = wakeDraft; wakeDraft = null;
  stopDictation(true); voice.stop();
  const turnChatId = currentChatId;
  const history = messages.filter(x => x.role === 'user' || x.role === 'assistant').slice(-80);
  const selected = [...pendingFiles];
  for (const f of selected) sentFiles.set(f.id, f.file);
  messages.push({role: 'user', text: message, attachments: selected.map(f => ({id:f.id, chatId:turnChatId, name: f.name, size: f.size, type: f.type, thumb: f.thumb || null}))});
  const userMessage = messages.at(-1);
  save(); if (view !== 'chat') setView('chat');
  $('#prompt').value = preservedDraft ?? ''; resizePrompt();
  lastStatus = ''; workPhase=selected.length?'reading':'thinking';completionState=null;completionStarted=0;drafts.clear(); spokenUpTo.clear();
  setBusy(true); renderMessages(); showWaiting();
  requestController = new AbortController();
  let received = false, turnFailed = false, turnCanceled = false; const generated = []; let boardFen = null; const turnStart = messages.length;
  try {
    const attachments = [];
    for (const item of selected) {
      if (waiting) waiting.setStatus('Uploading ' + item.name);
      const uploaded = await upload(item, requestController.signal);
      attachments.push(uploaded.id);
      const descriptor=userMessage.attachments.find(f=>f.id===item.id);
      if(descriptor)descriptor.id=uploaded.id;
      sentFiles.delete(item.id);item.id=uploaded.id;sentFiles.set(uploaded.id,item.file);save();
    }
    pendingFiles = []; renderTray();
    const response = await fetch('/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, signal: requestController.signal,
      body: JSON.stringify({message, userName, history, tasks, chatId: currentChatId, mode: $('#workMode').value, attachments, activeFile:fileWorkspace.context(),activeFileDirty:fileWorkspace.dirty, web: webEnabled, images: imageMode})});
    if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || 'YOGI could not connect to her engine.'); }
    const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '';
    const consume = line => {
      if (!line.trim()) return;
      const e = JSON.parse(line);
      if (e.type === 'draft') {
        workPhase='writing';
        hideWaiting(); $('#composerStatus').textContent = 'Writing…';
        drafts.set(e.itemId || 'stream', e.text || ''); scheduleDraftPaint(); speakProgress(e.itemId || 'stream', e.text || '');
      } else if (e.type === 'delta') { // older servers
        workPhase='writing';
        hideWaiting(); const key = e.itemId || 'stream'; drafts.set(key, (drafts.get(key) || '') + (e.delta || '')); scheduleDraftPaint();
      } else if (e.type === 'message') {
        received = true; const key = e.itemId || 'stream';
        const hadDraft = draftNodes.has(key);
        drafts.delete(key); draftNodes.get(key)?.li.remove(); draftNodes.delete(key);
        messages.push({role: 'assistant', text: e.text}); if (hadDraft) shownMessages.add(messages.at(-1)); save();
        const node = messageNode(messages.at(-1), new Set()); if (node) $('#messages').append(node);
        scrollThread(); speakProgress(key, e.text, true); workPhase='reasoning';
        if (busy) showWaiting(); // more may follow (tools, a second message)
      } else if (e.type === 'error') { turnFailed=true;workPhase='error';received = true; hideWaiting(); messages.push({role: 'error', text: e.text}); face.setState('error'); renderMessages(); }
      else if (e.type === 'approval') { workPhase='awaiting';approvalPanel.add(e); lastStatus = 'Waiting for your answer above'; waiting?.setStatus(lastStatus); }
      else if (e.type === 'images') { messages.push({role: 'images', text: e.images.length ? `Pictures for “${e.query}”` : `No pictures found for “${e.query}”. Try a shorter subject.`, images: e.images}); save(); renderMessages(); }
      else if (e.type === 'generated') { for (const image of e.images || []) if (!generated.some(g => g.url === image.url)) generated.push(image); }
      else if (e.type === 'board') { boardFen = e.fen; }
      else if (e.type === 'skills-changed') { refreshSkillLibrary(); slash.refresh(); }
      else if (e.type === 'notice') { messages.push({role: 'notice', text: e.text}); renderMessages(); }
      else if (e.type === 'status') { workPhase=phaseFromStatus(e);lastStatus = e.text; waiting?.setStatus(e.text); $('#composerStatus').textContent = e.text; }
    };
    while (true) {
      const {value, done} = await reader.read();
      pending += decoder.decode(value || new Uint8Array(), {stream: !done});
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) consume(line);
      if (done) { consume(pending); break; }
    }
    if (generated.length) { messages.push({role: 'generated', text: '', images: generated}); received = true; }
    const textFen = messages.slice(turnStart).filter(m => m.role === 'assistant').map(m => /```\s*(?:fen|chess)\b([\s\S]*?)```/i.exec(m.text || '')?.[1]).find(Boolean);
    const gameFen = startFen(textFen) || (boardFen && startFen(boardFen));
    if (gameFen) { messages.push({role: 'board', text: '', fen: gameFen, start: gameFen, moves: [], level: levelFrom(messages.length - 1)}); received = true; }
    if (!received) throw new Error('The connection ended before a reply arrived. Please try again.');
  } catch (error) {
    turnCanceled=error.name==='AbortError';turnFailed=!turnCanceled;
    for (const text of drafts.values()) if (text.trim()) messages.push({role: 'assistant', text});
    if (generated.length) messages.push({role: 'generated', text: '', images: generated});
    messages.push({role: error.name === 'AbortError' ? 'notice' : 'error', text: error.name === 'AbortError' ? 'Stopped.' : error.message});
    if (error.name !== 'AbortError') face.setState('error');
  } finally {
    hideWaiting(); drafts.clear(); requestController = null; approvalPanel.clear();
    completionState=turnCanceled?null:turnFailed?'error':'success';completionStarted=0;
    setBusy(false); save(); renderMessages(); lastStatus = '';fileWorkspace.refreshActive();
    if (!matchMedia('(pointer: coarse)').matches) $('#prompt').focus();
  }
}
$('#chatForm').onsubmit = e => { e.preventDefault(); ask($('#prompt').value); };
function resizePrompt() { const p = $('#prompt'); p.style.height = 'auto'; p.style.height = Math.min(p.scrollHeight, 180) + 'px'; }
$('#prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#chatForm').requestSubmit(); } });
$('#prompt').addEventListener('input', resizePrompt);
document.querySelectorAll('[data-prompt]').forEach(b => b.onclick = () => ask(b.dataset.prompt));
$('#stopResponse').onclick = () => { voice.stop(); requestController?.abort(); };

// ---------- Attachments ----------
function renderTray() {
  const tray = $('#tray'); tray.replaceChildren(); tray.hidden = !pendingFiles.length;
  const fresh = [];
  for (const item of pendingFiles) {
    const slot = fileCard(item, {onOpen: openPreview, onRemove: busy ? null : removed => { pendingFiles = pendingFiles.filter(f => f !== removed); renderTray(); }, progress: true});
    item.slot = slot; tray.append(slot);
    if (!item.shown) { item.shown = true; fresh.push(slot); }
  }
  if (fresh.length) animateIn(fresh);
}
async function addFiles(files) {
  if (busy) return toast('Wait for this reply to finish, then add files.');
  const all = [...pendingFiles.map(f => f.file), ...files];
  if (all.length > 10) return toast('Attach up to 10 files per message.');
  if (all.some(f => f.size > 100 * 1024 * 1024)) return toast('Each file must be under 100 MB.');
  if (all.reduce((n, f) => n + f.size, 0) > 500 * 1024 * 1024) return toast('Keep attachments under 500 MB per message.');
  for (const file of files) {
    const item = {id: crypto.randomUUID(), file, name: file.name, size: file.size, type: file.type, thumb: null, snippet: ''};
    pendingFiles.push(item);
    if (isImage(file)) item.thumb = await makeThumb(file); else item.snippet = await textSnippet(file);
  }
  renderTray(); if (view !== 'chat') setView('chat');
}
$('#attach').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = () => { addFiles([...$('#fileInput').files]); $('#fileInput').value = ''; };
let dragDepth = 0;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; dragDepth++; $('#dropOverlay').hidden = false; });
window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $('#dropOverlay').hidden = true; } });
window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; $('#dropOverlay').hidden = true; addFiles([...e.dataTransfer.files]); });
document.addEventListener('paste', e => {
  if ($('#nameGate').open) return;
  const data = e.clipboardData; if (!data) return;
  let files = [...(data.files || [])];
  if (!files.length) files = [...(data.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
  const text = data.getData('text/plain');
  if (!files.length && text.length > 4000) { // a long paste becomes a file, like Claude does
    e.preventDefault(); addFiles([new File([text], 'Pasted text.txt', {type: 'text/plain'})]); toast('Long text added as a file.'); return;
  }
  if (!files.length) return;
  e.preventDefault();
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  addFiles(files.map((f, i) => {
    if (f.name && !/^image\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name)) return f;
    const ext = ((f.type || '').split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png';
    return new File([f], `pasted-image-${stamp}${files.length > 1 ? '-' + (i + 1) : ''}.${ext}`, {type: f.type || 'image/png'});
  }));
  $('#prompt').focus();
});
initPreview();
const fileWorkspace=initFileWorkspace({getChatId:()=>currentChatId,notify:toast,onToggle:()=>{setView('chat');renderMessages();},onLocalChange:(item,file)=>{if(pendingFiles.includes(item)){item.file=file;item.size=file.size;item.thumb=null;textSnippet(file).then(snippet=>{item.snippet=snippet;renderTray();});}},onAsk:({name,path})=>{const prompt=$('#prompt');const ref='files/'+path;prompt.value=prompt.value.trim()?prompt.value+'\nFile to use: '+ref:'Edit the file '+ref+': ';resizePrompt();prompt.focus();}});
setFileWorkspaceHandler(item=>fileWorkspace.open(item));
document.addEventListener('yogi:file-saved',event=>{
 const {url,name}=event.detail||{};if(typeof url!=='string'||!url.startsWith('/files/'))return;
 const label=String(name||'Edited file').replace(/[\[\]\\\r\n]/g,'_');
 messages.push({role:'assistant',text:'Saved your edited file: ['+label+']('+location.origin+url+')'});save();renderMessages();
});

// ---------- History ----------
function renderHistory() {
  const box = $('#chatHistory'); box.replaceChildren(); $('#historyCount').textContent = chats.length;
  const restored = chats.filter(c => c.imported).length;
  $('#historySummary').textContent = `${chats.length} saved conversation${chats.length === 1 ? '' : 's'}` + (restored ? ` · ${restored} restored from backup` : ' · saved in this browser');
  document.querySelector('.restored-project').hidden = !restored;
  for (const chat of chats) {
    const li = el('li'), b = el('button');
    if (chat.id === currentChatId) b.setAttribute('aria-current', 'true');
    b.append(el('b', null, chat.title || 'Untitled conversation'), el('small', null, `${chat.messages?.length || 0} messages${chat.imported ? ' · restored' : ''}`));
    b.onclick = () => openChat(chat.id); li.append(b); box.append(li);
  }
}
function openChat(id) {
  if (busy) return toast('Stop or finish the current reply first.');
  const chat = chats.find(c => c.id === id); if (!chat) return;
  save(); currentChatId = id; messages = chat.messages || []; pendingFiles = []; $('#workMode').value = chat.mode || 'General';
  save(); renderTray(); renderMessages(); setView('chat');
}
function newChat() {
  if (busy) return toast('Stop or finish the current reply first.');
  save(); voice.stop(); currentChatId = crypto.randomUUID();
  chats.unshift({id: currentChatId, title: 'New conversation', messages: [], mode: 'General', updatedAt: Date.now()});
  messages = []; pendingFiles = []; $('#workMode').value = 'General';
  save(); renderTray(); renderMessages(); setView('chat'); $('#prompt').focus();
}
$('#newChat').onclick = newChat; $('#newChat2').onclick = newChat;
$('#workMode').value = chats.find(c => c.id === currentChatId)?.mode || 'General'; $('#workMode').onchange = save;
async function importBackupChats() {
  try {
    const response = await fetch('/api/imported-chats'); if (!response.ok) return;
    const data = await response.json();
    for (const chat of data.chats || []) {
      if (typeof chat.id !== 'string' || chats.some(c => c.id === chat.id) || !Array.isArray(chat.messages)) continue;
      chats.push({id: chat.id, title: String(chat.title || 'Restored conversation'), messages: chat.messages.filter(m => ['user', 'assistant'].includes(m.role) && typeof m.text === 'string'), mode: 'General', imported: true, updatedAt: 0});
    }
    save();
  } catch {}
}

// ---------- Tasks ----------
function renderTasks() {
  const box = $('#taskList'); box.replaceChildren();
  for (const task of tasks) {
    const li = el('li', 'task' + (task.done ? ' done' : ''));
    const input = el('input'); input.type = 'checkbox'; input.checked = !!task.done; input.id = 'task-' + task.id;
    input.onchange = () => { task.done = input.checked; save(); renderTasks(); };
    const label = el('label', null, task.text); label.htmlFor = input.id; label.style.flex = '1';
    const remove = el('button', null, '×'); remove.setAttribute('aria-label', 'Delete ' + task.text);
    remove.onclick = () => { tasks = tasks.filter(x => x.id !== task.id); save(); renderTasks(); };
    li.append(input, label, remove); box.append(li);
  }
  const done = tasks.filter(t => t.done).length;
  $('#emptyTasks').hidden = tasks.length > 0;
  $('#taskProgress').textContent = `${done} of ${tasks.length} done`;
  $('#progressBar').style.transform = `scaleX(${tasks.length ? done / tasks.length : 0})`;
  $('#taskCount').textContent = tasks.filter(t => !t.done).length;
}
$('#taskForm').onsubmit = e => {
  e.preventDefault(); const text = $('#taskInput').value.trim(); if (!text) return;
  if (tasks.length >= 100) return toast('Keep your list under 100 tasks.');
  tasks.push({id: crypto.randomUUID(), text, done: false}); $('#taskInput').value = ''; save(); renderTasks();
};

// ---------- Settings ----------
$('#testVoice').onclick = async () => {
  try { await voice.unlock(); voice.stop(); voice.enqueue(`Hello${userName ? ' ' + userName : ''}! I'm YOGI, and I was created by Vivaan Kheria. It's lovely to meet you.`); }
  catch (error) { toast(error.message); }
};
$('#saveElevenLabsKey').onclick = async () => {
  const input = $('#elevenLabsApiKey'), apiKey = input.value.trim();
  if (!apiKey) return toast('Paste your ElevenLabs API key first.');
  const button = $('#saveElevenLabsKey'); button.disabled = true;
  try {
    const response = await fetch('/api/settings/elevenlabs-key', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({apiKey})});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not save the key.');
    input.value = ''; elevenLabsReady = !!data.voice?.configured; voice.fallback = false;
    $('#voiceStatus').textContent = 'ElevenLabs key saved. Press Test voice to hear it.'; toast('ElevenLabs key saved on this computer.');
  } catch (error) { toast(error.message); } finally { button.disabled = false; }
};
let currentAccessMode='full',savingAccessMode=false;
function showAccessMode(access){
  if(!access||!['full','workspace'].includes(access.mode))return;
  currentAccessMode=access.mode;
  if(!savingAccessMode)$('#accessMode').value=access.mode;
  $('#accessModeStatus').textContent=access.mode==='full'?'Full access · local approval prompts are off.':'Workspace access · additional access may need your approval.';
}
$('#accessMode').onchange=async()=>{
 const select=$('#accessMode'),mode=select.value;select.disabled=true;savingAccessMode=true;
 try{const response=await fetch('/api/settings/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not change access mode.');savingAccessMode=false;showAccessMode(data.access);toast('Access mode saved. It applies to your next message.');}
 catch(error){select.value=currentAccessMode;toast(error.message);}
 finally{savingAccessMode=false;select.disabled=false;}
};

function applyPreferences() {
  const theme = prefs.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  const look = ['core', 'glass', 'marigold'].includes(prefs.ui) ? prefs.ui : 'core';
  document.documentElement.dataset.ui = look;
  document.querySelectorAll('.ui-switch button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.ui === look)));
  $('#uiChoice').value = look;
  document.querySelector('meta[name=theme-color]').content = getComputedStyle(document.body).backgroundColor || (theme === 'light' ? '#F2F2F2' : '#000000');
  document.documentElement.classList.toggle('reduce-motion', !!prefs.reducedMotion);
  document.documentElement.dataset.cursor=prefs.cursor===false?'off':'on';
  $('#cursorPreference').checked=prefs.cursor!==false;
  document.body.dataset.face = faceStyleNow();
  $('#faceStyle').value = ['dots', 'orb', 'illustrated'].includes(prefs.faceStyle) ? prefs.faceStyle : 'auto';
  $('#themePreference').value = theme; $('#motionPreference').checked = !!prefs.reducedMotion;
  $('#voiceEngine').value = ['auto', 'elevenlabs', 'browser'].includes(prefs.voiceEngine) ? prefs.voiceEngine : 'auto';
  if (gsap) gsap.globalTimeline.timeScale(1);
}
const savePrefs = () => { store('gigga.preferences', prefs); applyPreferences(); };
$('#themePreference').onchange = () => { prefs.theme = $('#themePreference').value; motion.switchLook(savePrefs); };
const switchUi = (next, origin) => { if (next === prefs.ui) return; prefs.ui = next; motion.switchLook(() => { savePrefs(); face.setState(activity(), true); }, origin); };
document.querySelectorAll('.ui-switch button').forEach(b => b.addEventListener('click', event => switchUi(b.dataset.ui, {x: event.clientX, y: event.clientY})));
$('#uiChoice').onchange = () => switchUi($('#uiChoice').value);
$('#cursorPreference').onchange=()=>{prefs.cursor=$('#cursorPreference').checked;savePrefs();};
$('#motionPreference').onchange = () => { prefs.reducedMotion = $('#motionPreference').checked; savePrefs(); face.setState(activity(), true); };
$('#faceStyle').onchange = () => { prefs.faceStyle = $('#faceStyle').value; savePrefs(); };
$('#expressionChoice').append(new Option('Automatic (follows what YOGI is doing)', ''));
for(const [name,expression] of Object.entries(EXPRESSIONS)) { const option=document.createElement('option');option.value=name;option.textContent=expression.label;$('#expressionChoice').append(option); }
$('#expressionChoice').value=prefs.expression||'';face.pin(prefs.expression||null);
$('#expressionChoice').onchange=()=>{prefs.expression=$('#expressionChoice').value;store('gigga.preferences',prefs);face.pin(prefs.expression||null);toast(prefs.expression?EXPRESSIONS[prefs.expression].label+' will stay until you choose Automatic.':'Expressions follow what YOGI is doing again.');};
$('#previewExpression').onclick=()=>{const name=$('#expressionChoice').value;if(!name)return toast('Choose an expression first.');face.express(name,3);};

$('#voiceEngine').onchange = () => { prefs.voiceEngine = $('#voiceEngine').value; voice.fallback = false; savePrefs(); };
$('#reconnectEngine').onclick = async () => {
  const button=$('#reconnectEngine');button.disabled=true;
  try {const response=await fetch('/api/reconnect',{method:'POST'});const data=await response.json();if(!response.ok)throw new Error(data.error);await status();toast(data.connected?'Engine reconnected.':'Check your selected CLI in Settings, then reconnect.');}catch(error){toast(error.message);}finally{button.disabled=false;}
};
async function refreshSavedFiles() {
  const box=$('#savedFiles');box.replaceChildren();
  try {
    const response=await fetch('/api/uploads');if(!response.ok)throw new Error('Could not load saved files.');const data=await response.json();
    $('#fileStorageStatus').textContent=(data.usedBytes/1024**2).toFixed(1)+' MB of '+(data.maxStoredBytes/1024**3).toFixed(1)+' GB used';
    for(const file of data.files){const row=el('div','saved-file');row.append(el('span',null,file.name+' · '+(file.size/1024).toFixed(1)+' KB'));const button=el('button',null,'Delete');button.type='button';button.setAttribute('aria-label','Delete saved file '+file.name);button.onclick=async()=>{if(!confirm('Permanently delete '+file.name+'? Earlier messages will no longer be able to open this attachment.'))return;button.disabled=true;try{const result=await fetch('/api/uploads/'+encodeURIComponent(file.id)+'?chatId='+encodeURIComponent(file.chatId),{method:'DELETE'});const body=await result.json();if(!result.ok)throw new Error(body.error);sentFiles.delete(file.id);await refreshSavedFiles();}catch(error){toast(error.message);button.disabled=false;}};row.append(button);box.append(row);}
    if(!data.files.length)box.append(el('p','field-note','No saved uploads.'));
  } catch(error){$('#fileStorageStatus').textContent=error.message;}
}
$('#refreshSavedFiles').onclick=refreshSavedFiles;
$('#exportData').onclick = () => {
  save(); const blob = new Blob([JSON.stringify({chats, tasks}, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement('a'), {href: url, download: 'yogi-workspace.json'}); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
applyPreferences();
const looks = initLooks({prefs, save: () => store('gigga.preferences', prefs), toast});
const slash = initSlash({openSkills: () => { setView('settings'); document.querySelector('.skill-library-setting').scrollIntoView({block:'start'}); }});

// ---------- Present mode ----------
function setPresent(on) {
  const apply = () => {
    document.body.classList.toggle('present', on);
    $('#presentToggle').setAttribute('aria-pressed', String(on));
    $('#presentLabel').textContent = on ? 'Exit present' : 'Present';
    $('#presentToggle').title = on ? 'Exit present mode (Esc)' : 'Present: enlarge the face (P). Esc to exit.';
  };
  // The face grows from where it is into the centre of the screen.
  if(document.startViewTransition&&!reduced()){const transition=document.startViewTransition(apply);transition.ready.catch(()=>{});transition.finished.catch(()=>{});transition.updateCallbackDone.catch(()=>{});}else apply();
  if (on) toast('Present mode. Press Esc or P to exit.');
}
$('#presentToggle').onclick = () => setPresent(!document.body.classList.contains('present'));

// ---------- Dictation (Space, the Talk button, or the face) ----------
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let acceptedSpeech = new Map(), speechFinality = new Map(), dictationEpoch = 0;
let manualCarry = '', manualFinal = '', pendingSpeechSend = null, speechCloseTimer;
let wakeEnabled = !!Recognition && load('yogi.wakeEnabled', false) === true, wakeSession = false, wakeIndex = -1, wakeSilenceTimer, wakeRetryAt = 0, wakeErrors = 0;
let wakeClosing = false, wakeCommand = '', wakeIssue = '', wakeStartTimer;
let wakeHeard = '', wakeContinuing = false, wakeCarry = '', wakeDraft = null, wakeCommandFinal = false;
function acknowledgeWake() {
  dictationEpoch++;
  toast('Yes, I’m listening. Ask your question.');
  voice.stop();
  requestController?.abort();
  try {
    const context = voice.context;
    if (!context || context.state !== 'running') return;
    const oscillator = context.createOscillator(), gain = context.createGain(), now = context.currentTime;
    oscillator.frequency.setValueAtTime(740, now); oscillator.frequency.setValueAtTime(990, now + .06);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.035, now + .01); gain.gain.exponentialRampToValueAtTime(.001, now + .14);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(now); oscillator.stop(now + .15);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch {}
}
function wakePaused() { return !!document.querySelector('dialog[open]'); }
function wakeState() {
  const state = !wakeEnabled ? 'off' : wakePaused() ? 'paused' : listening ? 'listening' : recognitionActive && wakeSession && !wakeClosing ? 'armed' : 'reconnecting';
  if (document.body.dataset.wake !== state) document.body.dataset.wake = state;
  $('#micInline').title = wakeEnabled ? 'Hey Yogi is enabled. Click for manual dictation.' : 'Dictate (Space)';
  $('#wakeToggle').disabled = !Recognition;
  $('#wakeToggle').setAttribute('aria-pressed', String(wakeEnabled));
  $('#wakeToggle').textContent = wakeEnabled ? 'Disable wake word' : 'Enable wake word';
  $('#wakeChip').setAttribute('aria-pressed', String(wakeEnabled)); $('#wakeChip').hidden = !Recognition;
  $('#wakeChip').title = wakeEnabled ? 'Hey Yogi is on. Click to turn it off.' : 'Turn on “Hey Yogi” hands-free listening';
  $('#wakeStatus').textContent = !Recognition ? 'Wake word needs Chrome or Edge with speech recognition.' : !wakeEnabled ? (wakeIssue || 'Wake word is off.') : listening ? (wakeSession ? 'Listening to your question. Pause to send.' : 'Manual dictation is active. Stop the microphone to send and rearm Hey Yogi.') : wakePaused() ? 'Wake word paused while a dialog is open.' : recognitionActive && wakeSession && !wakeClosing ? 'Microphone on. Say “Hey Yogi” and your question.' : (wakeIssue || 'Connecting wake-word microphone…');
}
async function syncWake() {
  wakeState();
  if (!Recognition || !wakeEnabled || pendingSpeechSend || (listening && !wakeContinuing)) return;
  if (wakePaused()) {
      if (wakeSession && (recognitionActive || recognitionStarting) && !wakeClosing) { wakeClosing = true; recognition.abort(); watchSpeechClose(); }
    return;
  }
  if (recognitionActive || recognitionStarting || Date.now() < wakeRetryAt) return;
  // One speech service owns the microphone in both wake and manual modes.
  // An unrelated audio-level stream must never veto recognized words.
  // Every new recognition session must release the previous session's closing latch.
  wakeClosing = false; wakeSession = true; wakeIndex = -1; acceptResults = false; recognitionStarting = true;
  if (!listening) { wakeContinuing = false; wakeCommand = ''; wakeCarry = ''; wakeCommandFinal = false; }
  createRecognition(); watchSpeechStart(true);
  try { recognition.start(); } catch (error) { clearTimeout(wakeStartTimer); recognitionStarting = false; wakeIssue = 'Speech service is reconnecting…'; wakeRetryAt = Date.now() + 1500; }

}
function disableWake() {
  wakeEnabled = false; wakeContinuing = false; store('yogi.wakeEnabled', false); clearTimeout(wakeStartTimer); clearTimeout(wakeSilenceTimer);
  if (wakeSession) {
    if (listening) stopDictation(true);
    else if (recognitionActive || recognitionStarting) { wakeClosing = true; recognition.abort(); watchSpeechClose(); }
  }
  wakeState();
}
$('#wakeChip').onclick = () => $('#wakeToggle').click();
$('#wakeSensitivity').value = prefs.wakeSensitivity;
$('#wakeSensitivity').onchange = () => { prefs.wakeSensitivity = $('#wakeSensitivity').value; setWakeSensitivity(prefs.wakeSensitivity); store('gigga.preferences', prefs); toast('Wake word sensitivity: ' + $('#wakeSensitivity').selectedOptions[0].textContent); };
$('#wakeToggle').onclick = () => {
  if (wakeEnabled) { wakeIssue = ''; return disableWake(); }
  if (!Recognition) return;
  wakeEnabled = true; wakeIssue = ''; wakeHeard = ''; $('#wakeHeard').textContent = ''; wakeErrors = 0; wakeRetryAt = 0;
  store('yogi.wakeEnabled', true); voice.unlock().catch(() => {});
  syncWake();
};

function voiceState() {
  $('#micInline').classList.toggle('listening', listening);
  $('#micInline').setAttribute('aria-label', listening ? 'Stop dictation' : 'Dictate');
  $('#dictationStatus').textContent = listening ? (recognitionActive ? (wakeSession ? 'Listening. Pause after your question to send.' : 'Listening. Press Space or the microphone again to send.') : 'Connecting the microphone…') : 'Press Space or tap the microphone to talk. Press again to send.';
  updateActivity();
}
function watchSpeechStart(isWake) {
  clearTimeout(wakeStartTimer);
  const current = recognition;
  wakeStartTimer = setTimeout(() => {
    if (recognition !== current || !recognitionStarting) return;
    recognition = null; recognitionStarting = false; recognitionActive = false;
    try { current.abort(); } catch {}
    wakeIssue = 'The browser speech service did not start. Check microphone access and your connection.';
    if (isWake) {
      wakeErrors++; wakeRetryAt = Date.now() + 1500;
      if (wakeErrors >= 3) { disableWake(); toast(wakeIssue); }
    } else { listening = false; acceptResults = false; toast(wakeIssue); }
    voiceState(); wakeState();
  }, 12000);
}
function watchSpeechClose() {
  clearTimeout(speechCloseTimer);
  const current = recognition;
  speechCloseTimer = setTimeout(() => {
    if (recognition !== current || (!recognitionActive && !recognitionStarting)) return;
    recognition = null; recognitionActive = false; recognitionStarting = false; wakeClosing = false;
    clearTimeout(wakeStartTimer);
    try { current.abort(); } catch {}
    finishSpeechSend();
    if (listening && !wakeSession) { manualCarry = manualFinal; beginRecognition(); }
    else {
      if (wakeSession && listening) { wakeCarry = wakeCommandFinal ? wakeCommand : wakeCarry; wakeContinuing = true; }
      syncWake();
    }
  }, 2000);
}
function finishSpeechSend() {
  const pending = pendingSpeechSend; pendingSpeechSend = null;
  if (!pending || pending.epoch !== dictationEpoch || listening) return;
  const captured = pending.wake ? (wakeCommandFinal ? wakeCommand : '') : manualFinal;
  if (!captured.trim()) { toast('No confirmed speech was received. Your draft is still here; try the microphone again.'); return; }
  const message = pending.wake ? captured : [draftBase, captured].filter(Boolean).join(' ');
  if (!busy) ask(message);
}
function beginRecognition() {
  clearTimeout(restartTimer);
  if (!listening || recognitionActive || recognitionStarting) return;
  wakeSession = false; wakeIndex = -1; acceptResults = true; recognitionStarting = true;
  createRecognition(); watchSpeechStart(false); voiceState();
  try { recognition.start(); }
  catch { clearTimeout(wakeStartTimer); recognitionStarting = false; listening = false; acceptResults = false; voiceState(); toast('Could not start speech recognition. Check microphone access and try again.'); }
}
function startDictation() {
  if (busy) return;
  if (!Recognition) return toast('Open YOGI in Chrome or Edge to talk to her.');
  dictationEpoch++; pendingSpeechSend = null; manualCarry = ''; manualFinal = '';
  draftBase = $('#prompt').value.trim(); acceptedSpeech.clear(); speechFinality.clear();
  voice.stop(); if (view !== 'chat') setView('chat');
  if (wakeSession && (recognitionActive || recognitionStarting)) { acceptResults = false; wakeSession = false; recognition.abort(); watchSpeechClose(); }
  listening = true; voiceState(); beginRecognition();
}
function stopDictation(discard = false) {
  const was = listening;
  const epoch = dictationEpoch;
  if (discard && wakeSession && was && wakeDraft !== null) { $('#prompt').value = wakeDraft; wakeDraft = null; resizePrompt(); }
  wakeContinuing = false;
  if (was && !discard) pendingSpeechSend = {epoch, wake: wakeSession};
  else if (discard) pendingSpeechSend = null;
  if (wakeSession && was) wakeClosing = true;
  clearTimeout(wakeSilenceTimer);
  listening = false; clearTimeout(restartTimer);
  if (discard) acceptResults = false;
  if (recognition && (was || !wakeSession) && (recognitionActive || recognitionStarting)) {
    try { discard ? recognition.abort() : recognition.stop(); watchSpeechClose(); } catch { recognitionActive = false; recognitionStarting = false; finishSpeechSend(); }
  } else finishSpeechSend();
  voiceState(); wakeState();
}

function createRecognition() {
  recognition = new Recognition();
  const current = recognition; recognition.lang = 'en-IN'; recognition.interimResults = true; recognition.continuous = true; recognition.maxAlternatives = 5;
  recognition.onstart = () => {
    if (recognition !== current) return;
    acceptedSpeech.clear(); speechFinality.clear();
    clearTimeout(wakeStartTimer); recognitionStarting = false; recognitionActive = true;
    if (wakeSession) { wakeIssue = ''; if (!wakeEnabled || wakePaused()) { wakeClosing = true; recognition.abort(); } wakeState(); return; }
    if (!listening) { recognition.stop(); return; } voiceState();
  };
  recognition.onresult = e => {
    if (recognition !== current) return;
    // Show what the recognizer heard before applying any local filter.
    const raw = Array.from(e.results,result=>result?.[0]?.transcript?.trim()||'').filter(Boolean).join(' ');
    if (!wakeSession && !acceptResults) return;
    if (wakeSession) $('#wakeHeard').textContent = 'Heard: ' + raw.slice(-160);
    let changed = false;
    for(const index of acceptedSpeech.keys()) if(index>=e.results.length){acceptedSpeech.delete(index);speechFinality.delete(index);changed=true;}
    for (let i = e.resultIndex || 0; i < e.results.length; i++) {
      const result = e.results[i];
      let text;
      if (wakeSession) {
        // Prefer an explicit wake phrase found in a recognition alternative.
        // Confidence values vary by accent and service, so they cannot veto
        // a recognized wake phrase or the question immediately following it.
        const alternatives=Array.from(result||[]);
        const candidate=alternatives.find(a=>findWakePhrase(a.transcript)) || alternatives[0];
        text=String(candidate?.transcript||'').trim();
        // An interim guess may acknowledge a wake phrase or update its question,
        // but only a final question can be submitted.
        // Keep partial tokens so a phrase split across results can match.
      } else text = String(result?.[0]?.transcript || '').trim();
      if(text && (acceptedSpeech.get(i)!==text || speechFinality.get(i)!==!!result.isFinal)) {
        acceptedSpeech.set(i,text);speechFinality.set(i,!!result.isFinal);changed=true;
      } else if (!text && acceptedSpeech.has(i)) { acceptedSpeech.delete(i);speechFinality.delete(i);changed=true; }
    }
    if (!changed) return;
    const transcript = [...acceptedSpeech.entries()].sort((a,b)=>a[0]-b[0]).map(([,text])=>text).join(' ');
    // Saying the wake phrase during manual dictation should still activate
    // hands-free question capture, using the same live microphone session.
    const manualWake = !wakeSession && listening && wakeEnabled && findWakePhrase(transcript);
    if (manualWake) {
      wakeDraft = [draftBase, manualCarry, transcript.slice(0, manualWake.index).trim()].filter(Boolean).join(' ');
      draftBase = ''; wakeCarry = ''; wakeCommand = ''; wakeCommandFinal = false;
      wakeSession = true; wakeClosing = false; wakeContinuing = false; acknowledgeWake();
    }
    if (wakeSession) {
      if (wakeClosing && pendingSpeechSend?.wake) {
        const match = findWakePhrase(transcript);
        wakeCommand = [wakeCarry, match ? match.question : transcript.trim()].filter(Boolean).join(' ');
        wakeCommandFinal = [...speechFinality.values()].every(Boolean); return;
      }
      if (!wakeEnabled || wakeClosing || wakePaused()) return;
      // Recognition can split “Hey” and “Yogi” into separate results.
      // Search the combined utterance, including interim revisions.
      // Explicit phrase matching acknowledges activation; finality gates sending.
      wakeHeard = transcript.slice(-160);
      $('#wakeHeard').textContent = 'Heard: ' + wakeHeard;
      const match = findWakePhrase(transcript);
      if (!match && !listening && !wakeContinuing) return;
      if (!listening && match && voice.matchesPlayback(transcript.slice(match.index))) return;
      if (!listening) {
        acknowledgeWake();
        wakeDraft = $('#prompt').value; draftBase = ''; listening = true;
        if (view !== 'chat') setView('chat');
        voiceState();
      }
      const parts = [match ? match.question : transcript.trim()];
      const command = [wakeCarry, ...parts].filter(Boolean).join(' '); wakeCommand = command; wakeErrors = 0;
      wakeCommandFinal = [...speechFinality.values()].every(Boolean);
      $('#prompt').value = [draftBase, command].filter(Boolean).join(' ').slice(0, 10000); resizePrompt(); wakeState();
      clearTimeout(wakeSilenceTimer);
      wakeSilenceTimer = setTimeout(() => {
        if (listening && wakeSession) {
          if (!wakeCommandFinal && command) toast('The speech service did not confirm your question. Please try again.');
          stopDictation(!(command && wakeCommandFinal));
        }
      }, command && wakeCommandFinal ? 1200 : 8000);
      return;
    }
    if (!acceptResults) return;
    manualFinal = [manualCarry, ...[...acceptedSpeech.entries()].sort((a,b)=>a[0]-b[0]).filter(([i])=>speechFinality.get(i)).map(([,text])=>text)].filter(Boolean).join(' ');
    const parts = [manualCarry, transcript];
    $('#prompt').value = [draftBase, ...parts].filter(Boolean).join(' ').slice(0, 10000); resizePrompt();
  };
  recognition.onerror = e => {
    if (recognition !== current) return;
    if (e.error === 'no-speech' || e.error === 'aborted') { wakeClosing = true; watchSpeechClose(); wakeState(); return; }
    clearTimeout(wakeStartTimer);
    const wasWake = wakeSession;
    wakeClosing = true;
    if (wasWake && wakeDraft !== null) { $('#prompt').value = wakeDraft; wakeDraft = null; resizePrompt(); }
    listening = false; acceptResults = false; clearTimeout(restartTimer); clearTimeout(wakeSilenceTimer);
    pendingSpeechSend = null;
    if (wakeEnabled) {
      wakeErrors++; wakeRetryAt = Date.now() + Math.min(8000, 500 * 2 ** Math.min(wakeErrors - 1, 4));
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(e.error)) { wakeEnabled = false; store('yogi.wakeEnabled', false); }
    }
    if (wasWake) wakeIssue = e.error === 'not-allowed' || e.error === 'service-not-allowed'
      ? 'Microphone or speech access was blocked. Open this address in Google Chrome and allow microphone access.'
      : e.error === 'audio-capture' ? 'No working microphone was found. Check your input device, then enable wake word again.'
      : e.error === 'network' ? 'The browser speech service could not connect. Check your connection or try Google Chrome.'
      : 'Speech recognition failed (' + e.error + '). Try Google Chrome and enable wake word again.';
    watchSpeechClose(); voiceState(); wakeState();
    if (!wasWake || !wakeEnabled || wakeErrors === 1) toast(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Allow microphone access in Chrome to talk to YOGI. Wake word is off.' : e.error === 'network' ? (wakeEnabled ? 'Speech recognition lost its connection. Retrying shortly.' : 'Speech recognition lost its connection. Enable wake word to retry.') : wasWake ? 'Wake word could not use the microphone. Try enabling it again.' : 'Speech recognition is unavailable. You can still type.');
  };
  recognition.onend = () => {
    if (recognition !== current) return;
    clearTimeout(speechCloseTimer); clearTimeout(wakeStartTimer); recognitionActive = false; recognitionStarting = false; wakeClosing = false;
    if (pendingSpeechSend) { finishSpeechSend(); voiceState(); wakeState(); return; }
    if (wakeSession && listening) {
      // A service session ending is not the user finishing their question.
      // Preserve captured words and let the existing silence timer decide when to send.
      wakeCarry = wakeCommandFinal ? wakeCommand : wakeCarry; wakeContinuing = true; wakeRetryAt = Date.now() + 100; wakeState(); return;
    }
    if (listening) { manualCarry = manualFinal; restartTimer = setTimeout(beginRecognition, 100); }
    wakeSession = false; wakeRetryAt = Math.max(wakeRetryAt, Date.now() + 250);
    voiceState(); wakeState();
  };
}
if (Recognition) createRecognition();
const toggleTalk = () => listening ? stopDictation() : startDictation();
$('#mic').onclick = toggleTalk; $('#micInline').onclick = toggleTalk;
$('#faceButton').onclick = () => { if (voice.isPlaying) { voice.stop(); return; } toggleTalk(); };
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (voice.isPlaying) { voice.stop(); event.preventDefault(); } else if (document.body.classList.contains('present') && !document.querySelector('dialog[open]')) setPresent(false); return; }
  const typing = event.target?.closest?.('input,textarea,select,button,a,summary,dialog,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="button"]');
  if (typing || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  if (event.key === 'p' || event.key === 'P') { setPresent(!document.body.classList.contains('present')); return; }
  // "/" anywhere opens the skill picker in the chat box.
  if (event.key === '/') { event.preventDefault(); const p = $('#prompt'); p.focus(); p.value = '/'; p.dispatchEvent(new Event('input')); return; }
  if (event.code !== 'Space' || event.shiftKey || event.defaultPrevented) return;
  event.preventDefault(); if (event.repeat) return;
  toggleTalk();
});
const wakeMonitor = setInterval(syncWake, 100); wakeState();
window.addEventListener('online', () => { wakeErrors = 0; wakeRetryAt = 0; syncWake(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { wakeRetryAt = 0; syncWake(); } });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
window.addEventListener('pagehide', () => { pendingSpeechSend = null; clearTimeout(speechCloseTimer); clearTimeout(wakeStartTimer); wakeEnabled = false; clearInterval(wakeMonitor); clearTimeout(wakeSilenceTimer); voice.stop(); clearTimeout(restartTimer); listening = false; recognition?.abort(); });

// ---------- Greeting, status, name ----------
function greet() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata'}).format(new Date()));
  const part = hour < 5 ? 'Hello' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  $('#greeting').textContent = `${part}${userName ? ', ' + userName : ''}`;$('#coreGreeting').textContent=`At your service${userName?', '+userName:''}.`;
}
const engineSettings=initEngineSettings({onChange:async()=>{pluginPanel.loaded=false;await pluginPanel.load(true);await status();},isBusy:()=>busy});
async function status() {
  try {
    const response = await fetch('/api/status'); if (!response.ok) throw new Error();
    const data = await response.json(); connected = !!data.connected;showAccessMode(data.access);
    $('#connState').className = 'conn ' + (connected ? 'on' : 'off');
    $('#connText').textContent = connected ? (data.engine?.auth==='unknown'?'CLI found':'Online') : 'Setup needed';
    $('#settingsStatus').textContent = data.engine ? `${data.engine.name} · ${data.engine.model||'CLI default model'}. ${data.engine.detail||'Connected and ready.'}` : (connected ? 'Connected and ready.' : 'Choose and sign in to a CLI, then reconnect.');
    elevenLabsReady = !!data.voice?.configured;
    $('#voiceStatus').textContent = elevenLabsReady ? 'ElevenLabs key loaded. YOGI will use the ElevenLabs voice.' : 'No ElevenLabs key yet. YOGI will use the built-in voice until you add one.';
  } catch {
    $('#connState').className = 'conn off'; $('#connText').textContent = 'Offline'; $('#settingsStatus').textContent = 'YOGI’s server is not running.';
  }
}
function askName(force) {
  const gate = $('#nameGate'), input = $('#nameGateInput');
  let asked = false; try { asked = sessionStorage.getItem('janmate.nameAsked') === '1'; } catch {}
  if ((asked || userName) && !force) return;
  input.value = userName; gate.showModal(); setTimeout(() => { input.focus(); input.select(); }, 30);
}
$('#nameGateForm').addEventListener('submit', () => {
  const v = cleanName($('#nameGateInput').value);
  if (v) { userName = v; try { localStorage.setItem('janmate.userName', v); } catch {} }
  try { sessionStorage.setItem('janmate.nameAsked', '1'); } catch {}
  greet(); updateActivity(true);
});
$('#nameGate').addEventListener('cancel', e => { if (!userName) e.preventDefault(); else try { sessionStorage.setItem('janmate.nameAsked', '1'); } catch {} });
$('#changeName').onclick = () => askName(true);

// ---------- Start ----------
setView(PANELS[location.hash.slice(1)]?location.hash.slice(1):'core');
window.addEventListener('hashchange', () => setView(location.hash.slice(1) || 'core'));
renderHistory(); importBackupChats(); renderTasks(); updateVoice(); save(); renderMessages(); greet(); status(); resizePrompt(); refreshSkillLibrary();
setInterval(()=>{if(!document.hidden)status();},30000); setInterval(()=>{if(!document.hidden)greet();},60000);
askName(false);
if (gsap && !reduced()) {
  gsap.from('#face', {scale: .85, opacity: 0, duration: .9, ease: 'back.out(1.6)', transformOrigin: '50% 60%'});
  gsap.from(['.stage-copy', '.stage-controls'], {y: 16, opacity: 0, duration: .6, ease: 'power3.out', stagger: .08, delay: .2});
  gsap.from(['.welcome-hello', '.welcome-sub'], {y: 16, opacity: 0, duration: .5, ease: 'power3.out', stagger: .06, delay: .25});
  gsap.from('.dock', {y: 24, opacity: 0, duration: .7, ease: 'expo.out', delay: .15, clearProps: 'transform,opacity'});
  if (window.SplitText) { try { const split = new SplitText('#coreGreeting', {type: 'words'}); gsap.from(split.words, {y: 14, opacity: 0, filter: 'blur(6px)', duration: .7, ease: 'power3.out', stagger: .05, delay: .3, onComplete: () => split.revert()}); } catch {} }
}
