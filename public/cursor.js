// YOGI's pointer, one engine with a look per interface:
//   core      – the dot-matrix arrow, a red follower, and a dotted ring burst on click
//   glass     – an iPadOS-style lens that morphs onto whatever you can press
//   marigold  – a soft petal that stretches with speed and scatters petals on click
// Springs start from the current on-screen value, so every move is interruptible.
// Native cursors stay for text, dialogs, touch, and when motion is reduced.
const fine = matchMedia('(any-pointer: fine) and (any-hover: hover)');
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;
// Cursor style comes from Settings; "auto" picks the one that belongs to the interface.
const AUTO = {core: 'matrix', glass: 'ring', marigold: 'petal'};
const ui = () => { const chosen = root.dataset.cursorStyle; return ['matrix', 'ring', 'petal', 'comet'].includes(chosen) ? chosen : AUTO[root.dataset.ui] || 'matrix'; };
const HOT = 'button,a[href],summary,label[for],.check,[role="button"],[role="tab"],.chess-square,.face-button';
const nativeZone = target => target?.closest?.('input:not([type=checkbox]):not([type=radio]),textarea,select,iframe,dialog,[contenteditable]:not([contenteditable="false"]),[data-native-cursor],:disabled,[aria-disabled="true"]');

const layer = document.createElement('div'); layer.className = 'yogi-cursor'; layer.setAttribute('aria-hidden', 'true');
const dot = document.createElement('i'), ring = document.createElement('i'), lens = document.createElement('i'), effects = document.createElement('div');
dot.className = 'yogi-cursor-dot'; ring.className = 'yogi-cursor-ring'; lens.className = 'yogi-cursor-lens'; effects.className = 'yogi-click-effects';

// Dot-matrix arrow for the Core look.
const rows = [[0],[0,1],[0,1,2],[0,1,2,3],[0,1,2,3,4],[0,1,2,3,4,5],[0,1,2,3,4,5,6],[0,1,2,3],[0,1,3,4],[0,4,5],[5]];
const cells = new Set(rows.flatMap((row, y) => row.map(x => `${x},${y}`)));
const outline = new Set();
for (const cell of cells) { const [x, y] = cell.split(',').map(Number); for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) { const edge = `${x+dx},${y+dy}`; if (!cells.has(edge)) outline.add(edge); } }
const pixel = (cell, r) => { const [x, y] = cell.split(',').map(Number); return `<circle cx="${x*3}" cy="${y*3}" r="${r}"/>`; };
const arrow = `<svg class="yogi-arrow" viewBox="-4 -4 30 42" width="30" height="42" focusable="false" aria-hidden="true"><g class="yogi-matrix-outline">${[...outline].map(c => pixel(c, .8)).join('')}</g><g class="yogi-matrix-pixels">${[...cells].map(c => pixel(c, 1.1)).join('')}</g><circle class="yogi-matrix-accent" cx="15" cy="30" r="1.5"/></svg>`;
dot.innerHTML = arrow + '<b class="yogi-point"></b>'; ring.innerHTML = arrow + '<b class="yogi-petal"></b>';
const trail = Array.from({length: 12}, (_, i) => { const el = document.createElement('i'); el.className = 'yogi-trail'; el.style.setProperty('--i', i); layer.append(el); return {el, x: 0, y: 0}; });
layer.append(lens, ring, dot, effects); document.body.append(layer);

// Critically damped spring stepping (Apple's "response" in seconds, damping 1).
function spring(state, target, dt, response = .18, damping = 1) {
  const k = (2 * Math.PI / response) ** 2, c = 4 * Math.PI * damping / response;
  // Small fixed substeps keep the spring stable even when a frame is slow.
  const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
  for (const key of Object.keys(target)) {
    let v = state.v[key] || 0, x = state[key];
    for (let i = 0; i < steps; i++) { v += (-k * (x - target[key]) - c * v) * h; x += v * h; }
    state.v[key] = v; state[key] = x;
  }
}
const P = {x: 0, y: 0, vx: 0, vy: 0};
const F = {x: 0, y: 0, v: {}};                    // follower / petal
const L = {x: 0, y: 0, w: 22, h: 22, r: 11, v: {}}; // glass lens
let frame = 0, last = 0, visible = false, hotEl = null, pressed = false, lastMove = 0;
const allowed = () => fine.matches && !reducedQuery.matches && !root.classList.contains('reduce-motion') && root.dataset.cursor !== 'off' && root.dataset.cursorStyle !== 'system';

function stop() {
  // Guarded: classList.remove always records a mutation, which would re-trigger sync() forever.
  visible = false; if (layer.dataset.visible !== 'false') layer.dataset.visible = 'false'; if (root.classList.contains('yogi-pointer')) root.classList.remove('yogi-pointer');
  if (layer.dataset.pressed !== 'false') layer.dataset.pressed = 'false'; cancelAnimationFrame(frame); frame = 0; last = 0;
  release(); for (const child of effects.children) for (const a of child.getAnimations()) a.cancel(); effects.replaceChildren();
}
function release() { if (hotEl) { hotEl.style.removeProperty('translate'); hotEl.classList.remove('yogi-lifted'); } }

function render(now) {
  frame = 0; if (!visible) return;
  const dt = Math.min(.05, last ? (now - last) / 1000 : 1 / 60); last = now;
  const mode = ui();
  dot.style.transform = `translate3d(${P.x}px,${P.y}px,0)`;
  spring(F, {x: P.x, y: P.y}, dt, mode === 'petal' ? .22 : .16);
  let busy = Math.hypot(P.x - F.x, P.y - F.y) > .1 || Math.hypot(F.v.x || 0, F.v.y || 0) > 2;
  if (mode === 'comet') {
    // Each trail bead chases the one in front of it.
    let lead = {x: P.x, y: P.y};
    for (const bead of trail) { const k = 1 - Math.exp(-dt / .028); bead.x += (lead.x - bead.x) * k; bead.y += (lead.y - bead.y) * k; bead.el.style.transform = `translate3d(${bead.x}px,${bead.y}px,0)`; if (Math.abs(lead.x - bead.x) + Math.abs(lead.y - bead.y) > .3) busy = true; lead = bead; }
  }
  if (mode === 'petal') {
    // The petal stretches along its own velocity: motion encoded as shape.
    const speed = Math.hypot(F.v.x || 0, F.v.y || 0), stretch = Math.min(.55, speed / 2600), angle = Math.atan2(F.v.y || 0, F.v.x || 0);
    ring.style.transform = `translate3d(${F.x}px,${F.y}px,0) rotate(${angle}rad) scale(${1 + stretch},${1 - stretch * .55})`;
  } else ring.style.transform = `translate3d(${F.x}px,${F.y}px,0)`;
  if (mode === 'ring') {
    let target;
    if (hotEl && hotEl.isConnected) {
      const box = hotEl.getBoundingClientRect(), pad = box.width < 60 ? 6 : 4, radius = parseFloat(getComputedStyle(hotEl).borderTopLeftRadius) || 12;
      // The lens leans a little toward the pointer, like a highlight that follows your finger.
      const lean = 0.12;
      target = {x: box.left - pad + (P.x - (box.left + box.width / 2)) * lean, y: box.top - pad + (P.y - (box.top + box.height / 2)) * lean, w: box.width + pad * 2, h: box.height + pad * 2, r: Math.min(radius + pad, (box.height + pad * 2) / 2)};
    } else target = {x: P.x - 11, y: P.y - 11, w: 22, h: 22, r: 11};
    spring(L, target, dt, hotEl ? .2 : .12);
    lens.style.transform = `translate3d(${L.x}px,${L.y}px,0)`;
    lens.style.width = L.w + 'px'; lens.style.height = L.h + 'px'; lens.style.borderRadius = L.r + 'px';
    busy = busy || Math.abs(L.x - target.x) + Math.abs(L.y - target.y) + Math.abs(L.w - target.w) > .3;
  }
  if (busy || performance.now() - lastMove < 120) frame = requestAnimationFrame(render); else last = 0;
}
const kick = () => { if (!frame) frame = requestAnimationFrame(render); };

document.addEventListener('pointermove', event => {
  if (!allowed() || event.pointerType !== 'mouse' || nativeZone(event.target)) { if (visible) stop(); return; }
  P.vx = event.clientX - P.x; P.vy = event.clientY - P.y; P.x = event.clientX; P.y = event.clientY; lastMove = performance.now();
  if (!visible) {
    Object.assign(F, {x: P.x, y: P.y, v: {}}); for (const bead of trail) { bead.x = P.x; bead.y = P.y; } Object.assign(L, {x: P.x - 11, y: P.y - 11, w: 22, h: 22, r: 11, v: {}});
    visible = true; layer.dataset.visible = 'true'; root.classList.add('yogi-pointer');
  }
  const hot = event.target.closest?.(HOT) || null;
  if (hot !== hotEl) { release(); hotEl = hot; layer.dataset.hot = String(!!hot); if (hot && ui() === 'ring') hot.classList.add('yogi-lifted'); }
  // Glass: the hovered control drifts slightly with the pointer (pointer "parallax").
  if (hot && ui() === 'ring' && !hot.closest('.chess-board')) {
    const box = hot.getBoundingClientRect(), max = box.width > 160 ? 1.5 : 3;
    const tx = Math.max(-max, Math.min(max, (P.x - box.left - box.width / 2) / box.width * max * 2));
    const ty = Math.max(-max, Math.min(max, (P.y - box.top - box.height / 2) / box.height * max * 2));
    hot.style.translate = `${tx.toFixed(2)}px ${ty.toFixed(2)}px`;
  }
  kick();
}, {passive: true});

function burst(px, py) {
  const make = (className, frames, options, style = {}) => {
    while (effects.children.length >= 80) { const first = effects.firstElementChild; for (const a of first.getAnimations()) a.cancel(); first.remove(); }
    const node = document.createElement('i'); node.className = className; node.style.left = px + 'px'; node.style.top = py + 'px'; Object.assign(node.style, style); effects.append(node);
    node.animate(frames, options).finished.catch(() => {}).finally(() => node.remove());
  };
  const mode = ui();
  if (mode === 'matrix' || mode === 'comet') {
    // The dotted red ring: sixteen LEDs race outward, a white echo follows.
    for (let wave = 0; wave < 2; wave++) for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8 + wave * Math.PI / 16, distance = wave ? 34 : 24, dx = Math.cos(angle) * distance, dy = Math.sin(angle) * distance;
      make('yogi-click-spark' + (wave ? ' yogi-click-white' : ''), [
        {transform: 'translate(-50%,-50%) scale(.5)', opacity: 1},
        {transform: `translate(-50%,-50%) translate(${dx * .7}px,${dy * .7}px) scale(1)`, opacity: .9, offset: .45},
        {transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(.2)`, opacity: 0}],
        {duration: 460 + wave * 80, delay: wave * 40, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both'});
    }
  } else if (mode === 'ring') {
    make('yogi-click-ripple', [{transform: 'translate(-50%,-50%) scale(.2)', opacity: .55}, {transform: 'translate(-50%,-50%) scale(1)', opacity: 0}], {duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both'});
  } else {
    // Marigold petals: flung up and out, then they fall and turn.
    for (let i = 0; i < 12; i++) {
      const angle = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.4, power = 60 + Math.random() * 70;
      const vx = Math.cos(angle) * power, vy = Math.sin(angle) * power, spin = (Math.random() - .5) * 720;
      const frames = [];
      for (let s = 0; s <= 8; s++) { const t = s / 8; frames.push({transform: `translate(-50%,-50%) translate(${(vx * t).toFixed(1)}px,${(vy * t + 220 * t * t).toFixed(1)}px) rotate(${(spin * t).toFixed(0)}deg) scale(${1 - t * .35})`, opacity: t < .7 ? 1 : (1 - t) / .3}); }
      make('yogi-petal-bit' + (i % 3 === 0 ? ' alt' : ''), frames, {duration: 900 + Math.random() * 400, easing: 'linear', fill: 'both'});
    }
  }
}
document.addEventListener('pointerdown', event => {
  if (!allowed() || event.pointerType !== 'mouse' || event.button !== 0 || nativeZone(event.target)) { if (visible) stop(); return; }
  pressed = true; layer.dataset.pressed = 'true'; burst(event.clientX, event.clientY);
}, {passive: true});
document.addEventListener('pointerup', () => { pressed = false; layer.dataset.pressed = 'false'; }, {passive: true});
document.addEventListener('pointercancel', stop, {passive: true});
document.addEventListener('pointerout', event => { if (!event.relatedTarget) stop(); }, {passive: true});
window.addEventListener('blur', stop); window.addEventListener('pagehide', stop);
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
const sync = () => { if (layer.dataset.mode !== ui()) layer.dataset.mode = ui(); if (!allowed() || document.querySelector('dialog[open]')) stop(); };
fine.addEventListener('change', sync); reducedQuery.addEventListener('change', sync);
new MutationObserver(sync).observe(root, {attributes: true, attributeFilter: ['class', 'data-cursor', 'data-ui', 'data-cursor-style']});
new MutationObserver(records => { if (records.some(r => r.target.tagName === 'DIALOG')) sync(); }).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['open']});
sync();
export const pointer = P;
