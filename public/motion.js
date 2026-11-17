// Motion layer shared by all three looks: scroll reveals, large titles that
// collapse as you scroll, edge fades, a sliding tab indicator, magnetic buttons,
// a pointer spotlight, the face's gaze and playful reactions, and the animated
// switch between looks. Everything respects reduced motion.
import './cursor.js';
const gsap = window.gsap;
const root = document.documentElement;
const $ = s => document.querySelector(s);
const reducedNow = () => root.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initMotion({face}) {
  // ---------- Scroll reveal ----------
  const REVEAL = '.msg, .history > li, .task, .plugin-card, .setting, .skill-card, .local-plugin-row, .mcp-row, .suggestions > button, .saved-file';
  const observers = new Map();
  let batch = [], batchTimer = 0;
  const flushBatch = () => {
    batchTimer = 0;
    const positions=new Map(batch.map(node=>[node,node.getBoundingClientRect().top]));
    batch.sort((a,b)=>positions.get(a)-positions.get(b))
      .forEach((node, i) => { node.style.setProperty('--rv-delay', Math.min(i, 6) * 55 + 'ms'); node.classList.add('rv-in'); });
    batch = [];
  };
  const observerFor = scroller => {
    if (observers.has(scroller)) return observers.get(scroller);
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) if(!entry.target.isConnected){io.unobserve(entry.target);}else if (entry.isIntersecting) { io.unobserve(entry.target); batch.push(entry.target); }
      if (batch.length && !batchTimer) batchTimer = requestAnimationFrame(flushBatch);
    }, {root: scroller, rootMargin: '0px 0px -4% 0px', threshold: .01});
    observers.set(scroller, io); return io;
  };
  const scrollerOf = node => node.closest('.thread, .panel:not(.chat-panel)');
  function prepare(node) {
    if (node.dataset.rv || reducedNow()) return;
    const scroller = scrollerOf(node); if (!scroller) return;
    node.dataset.rv = '1'; node.classList.add('rv');
    observerFor(scroller).observe(node);
  }
  const scan = scope => scope.querySelectorAll?.(REVEAL).forEach(prepare);
  scan(document);
  new MutationObserver(records => {
    for (const r of records) {
      for(const n of r.removedNodes)if(n.nodeType===1){const clear=node=>{const scroller=scrollerOf(r.target);if(scroller)observers.get(scroller)?.unobserve(node);};if(n.matches(REVEAL))clear(n);n.querySelectorAll?.(REVEAL).forEach(clear);}
      for (const n of r.addedNodes) if (n.nodeType === 1) { if (n.matches(REVEAL)) prepare(n); if(!n.closest('.bubble'))scan(n); }
    }
  }).observe($('.work'), {childList: true, subtree: true});

  // ---------- Scroll-linked chrome ----------
  const scrollers = () => [$('#thread'), ...document.querySelectorAll('.panel:not(.chat-panel)')];
  const lastTop = new WeakMap();
  function onScroll(event) {
    const s = event.currentTarget, max = s.scrollHeight - s.clientHeight;
    s.dataset.edgeTop = String(s.scrollTop > 4);
    s.dataset.edgeBottom = String(max - s.scrollTop > 4);
    const host = s.closest('.panel') || s;
    host.style.setProperty('--collapse', Math.min(1, s.scrollTop / 90).toFixed(3));
    host.style.setProperty('--progress', max > 0 ? (s.scrollTop / max).toFixed(4) : '0');
    const previous = lastTop.get(s) ?? s.scrollTop; lastTop.set(s, s.scrollTop);
    const delta = s.scrollTop - previous;
    if (Math.abs(delta) > 2 && !reducedNow()) face.glanceScroll(delta < 0 ? -1 : 1);
  }
  for (const s of scrollers()) if (s) { s.addEventListener('scroll', onScroll, {passive: true}); onScroll({currentTarget: s}); }
  // Content changes alter the edges without a scroll event.
  const thread = $('#thread');
  new ResizeObserver(() => onScroll({currentTarget: thread})).observe($('#messages'));

  // ---------- Smooth, physical scrolling ----------
  // The wheel sets a target; the content glides to it (frame-rate independent),
  // so every scroll is an animation. Messages also lag a little behind fast
  // scrolls and spring back (like iMessage), and soften as they reach the edges.
  const smooth = new Map();
  const canScrollInside = (node, stop, dy) => {
    for (let el = node; el && el !== stop; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        if ((dy < 0 && el.scrollTop > 0) || (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1)) return true;
      }
    }
    return false;
  };
  function attachSmooth(scroller) {
    if (!scroller || smooth.has(scroller)) return;
    const st = {target: scroller.scrollTop, current: scroller.scrollTop, running: false, last: 0, velocity: 0, prevTop: scroller.scrollTop, self: false, offsets: new Map()};
    smooth.set(scroller, st);
    scroller.addEventListener('wheel', event => {
      if (reducedNow() || event.ctrlKey || event.defaultPrevented) return;
      if (canScrollInside(event.target, scroller, event.deltaY)) return;
      const max = scroller.scrollHeight - scroller.clientHeight; if (max <= 0) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? scroller.clientHeight : 1;
      if (!st.running) st.current = scroller.scrollTop;
      st.target = Math.max(0, Math.min(max, (st.running ? st.target : scroller.scrollTop) + event.deltaY * unit));
      start(st, scroller);
    }, {passive: false});
    scroller.addEventListener('scroll', () => { if (!st.self) { st.target = st.current = scroller.scrollTop; } st.self = false; kickDepth(scroller); }, {passive: true});
  }
  function start(st, scroller) {
    if (st.running) return; st.running = true; st.last = performance.now();
    const step = now => {
      const dt = Math.min(64, now - st.last); st.last = now;
      const k = 1 - Math.exp(-dt / 95);
      st.current += (st.target - st.current) * k;
      if (Math.abs(st.target - st.current) < .4) st.current = st.target;
      st.self = true; scroller.scrollTop = st.current;
      if (st.current !== st.target) requestAnimationFrame(step); else st.running = false;
    };
    requestAnimationFrame(step);
  }
  // Depth + elastic lag, computed only while something is moving.
  const depthState = new Map();
  function kickDepth(scroller) {
    if (reducedNow()||document.hidden||!scroller.clientHeight) return;
    let d = depthState.get(scroller);
    if (!d) { d = {prev: scroller.scrollTop, v: 0, running: false, last: 0, lag: new WeakMap()}; depthState.set(scroller, d); }
    if (d.running) return; d.running = true; d.last = performance.now();
    const frame = now => {
      if(document.hidden||reducedNow()||!scroller.clientHeight){d.running=false;d.v=0;return;}
      const dt = Math.max(1, Math.min(64, now - d.last)); d.last = now;
      const delta = scroller.scrollTop - d.prev; d.prev = scroller.scrollTop;
      d.v += (delta / dt * 16 - d.v) * .35;
      const settled = applyDepth(scroller, d, dt);
      if (Math.abs(d.v) > .05 || !settled) requestAnimationFrame(frame); else { d.running = false; d.v = 0; }
    };
    requestAnimationFrame(frame);
  }
  function applyDepth(scroller, d, dt) {
    const isThread = scroller.id === 'thread';
    const items = isThread ? scroller.querySelectorAll('#messages > li') : scroller.querySelectorAll('.setting, .plugin-row, .skill-card, .history > li, .task, .mcp-row');
    const h = scroller.clientHeight, top = scroller.getBoundingClientRect().top, fade = Math.min(90, h * .18);
    let settled = true;
    // Finish layout reads before any writes to avoid one forced reflow per row.
    const positions=Array.from(items,item=>({item,r:item.getBoundingClientRect()}));
    for (const {item,r} of positions) {
      const y = r.top - top, bottom = y + r.height;
      if (bottom < -40 || y > h + 40) continue;
      // Soften at the edges: scale and fade as an item slides under the top or bottom.
      const enter = Math.min(1, Math.max(0, bottom / fade)), leave = Math.min(1, Math.max(0, (h - y) / fade));
      const edge = Math.min(enter, leave), scale = .94 + .06 * edge, alpha = .25 + .75 * edge;
      // Elastic lag: items further from the middle trail the scroll a little more.
      const centre = (y + r.height / 2) / h - .5, wantLag = Math.max(-22, Math.min(22, -d.v * (0.6 + Math.abs(centre) * 1.6)));
      const current = d.lag.get(item) || 0, next = current + (wantLag - current) * (1 - Math.exp(-dt / 70));
      d.lag.set(item, Math.abs(next) < .05 ? 0 : next);
      if (Math.abs(next) > .05 || Math.abs(wantLag) > .05) settled = false;
      const targets = isThread ? item.children : [item];
      for (const node of targets) {
        node.style.scale = edge >= .999 ? '' : scale.toFixed(4);
        node.style.translate = Math.abs(next) < .05 ? '' : `0 ${next.toFixed(2)}px`;
        if (!item.classList.contains('rv') || item.classList.contains('rv-in')) node.style.opacity = edge >= .999 ? '' : alpha.toFixed(3);
        node.style.transformOrigin = y < h / 2 ? 'center bottom' : 'center top';
      }
    }
    return settled;
  }
  const wireScrollers = () => { attachSmooth($('#thread')); document.querySelectorAll('.work > .panel:not(.chat-panel):not(.core-panel)').forEach(attachSmooth); };
  wireScrollers();
  // New content changes the edges too.
  new ResizeObserver(() => kickDepth($('#thread'))).observe($('#messages'));

  // ---------- Sliding tab indicator ----------
  const tabs = $('.tabs'), indicator = document.createElement('span');
  indicator.className = 'tab-indicator'; indicator.setAttribute('aria-hidden', 'true'); tabs.prepend(indicator);
  root.classList.add('has-tab-indicator');
  let first = true;
  function placeIndicator() {
    const current = tabs.querySelector('.tab[aria-current="page"]'); if (!current) return;
    const box = {x: current.offsetLeft, y: current.offsetTop, w: current.offsetWidth, h: current.offsetHeight};
    if (first || reducedNow() || !gsap) { gsap?.killTweensOf(indicator); Object.assign(indicator.style, {width: box.w + 'px', height: box.h + 'px', transform: `translate(${box.x}px,${box.y}px)`}); first = false; return; }
    // Critically damped feel: quick, no overshoot, stretched slightly while travelling.
    gsap.to(indicator, {x: box.x, y: box.y, width: box.w, height: box.h, duration: .42, ease: 'expo.out', overwrite: true});
    if (tabs.scrollWidth > tabs.clientWidth + 2) tabs.scrollTo({left: Math.max(0, box.x - (tabs.clientWidth - box.w) / 2), behavior: reducedNow() ? 'auto' : 'smooth'});
  }
  new MutationObserver(placeIndicator).observe(tabs, {subtree: true, attributes: true, attributeFilter: ['aria-current']});
  new ResizeObserver(() => { first = true; placeIndicator(); }).observe(tabs);
  requestAnimationFrame(placeIndicator);

  // ---------- Glass: a faint light that follows the pointer across the background ----------
  let lightFrame = 0, lx = 0, ly = 0;
  document.addEventListener('pointermove', event => {
    if (root.dataset.ui !== 'glass' || reducedNow()) return;
    lx = event.clientX; ly = event.clientY;
    if (!lightFrame) lightFrame = requestAnimationFrame(() => { lightFrame = 0; root.style.setProperty('--lx', lx + 'px'); root.style.setProperty('--ly', ly + 'px'); });
  }, {passive: true});

  // ---------- Magnetic controls and spotlight ----------
  const MAGNET = '.send-btn, #faceButton, .ui-switch button, .mic-chip, .tab';
  let magnet = null;
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const target = event.target.closest?.(MAGNET);
    if (magnet && magnet !== target) { springBack(magnet); magnet = null; }
    if (target && !reducedNow() && root.dataset.cursor !== 'off' && root.dataset.ui !== 'glass') {
      magnet = target;
      const box = target.getBoundingClientRect(), strength = target.id === 'faceButton' ? .05 : .22;
      const x = (event.clientX - box.left - box.width / 2) * strength, y = (event.clientY - box.top - box.height / 2) * strength;
      target.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`; target.style.transition = 'translate .12s linear';
    }
    const spot = event.target.closest?.('.spot, .suggestions > button, .plugin-card, .skill-card, .composer, .panel');
    if (spot) { const box = spot.getBoundingClientRect(); spot.style.setProperty('--px', (event.clientX - box.left) + 'px'); spot.style.setProperty('--py', (event.clientY - box.top) + 'px'); }
  }, {passive: true});
  function springBack(node) { node.style.transition = 'translate .5s cubic-bezier(.2,.9,.25,1.2)'; node.style.translate = ''; }

  // ---------- The face notices you ----------
  const faceWrap = $('.face-wrap');
  let hoverTimer = 0, reversals = [], lastDx = 0, idleTimer = 0, sleeping = false;
  document.addEventListener('pointermove', event => {
    const box = faceWrap.getBoundingClientRect(); if (!box.width) return;
    const cx = box.left + box.width / 2, cy = box.top + box.height * .5;
    face.setGaze((event.clientX - cx) / Math.max(320, innerWidth * .45), (event.clientY - cy) / Math.max(260, innerHeight * .45));
    if (sleeping) { sleeping = false; face.express('surprised', 1.2); }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (document.body.dataset.activity === 'idle' && !document.hidden) { sleeping = true; face.express('sleepy', 600); } }, 120000);
    // Shake the pointer across the face and YOGI gets dizzy.
    const over = event.clientX > box.left && event.clientX < box.right && event.clientY > box.top && event.clientY < box.bottom;
    if (over && event.movementX) {
      const dir = Math.sign(event.movementX);
      if (dir && lastDx && dir !== lastDx && Math.abs(event.movementX) > 6) { const now = performance.now(); reversals = reversals.filter(t => now - t < 900); reversals.push(now); if (reversals.length >= 6 && !face.busyExpression) { reversals = []; face.express('dizzy', 2.2); } }
      if (dir) lastDx = dir;
    }
  }, {passive: true});
  faceWrap.addEventListener('pointerenter', () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => { if (document.body.dataset.activity === 'idle' && !face.busyExpression) face.express(Math.random() < .5 ? 'shy' : 'cheerful', 1.8); }, 700); });
  faceWrap.addEventListener('pointerleave', () => clearTimeout(hoverTimer));

  // ---------- Switching looks ----------
  return {
    switchLook(apply, origin) {
      if (!document.startViewTransition || reducedNow()) { apply(); return; }
      const x = origin?.x ?? innerWidth / 2, y = origin?.y ?? 0;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const transition = document.startViewTransition(apply);
      transition.finished.catch(()=>{});transition.updateCallbackDone.catch(()=>{});
      transition.ready.then(() => {
        document.documentElement.animate({clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]}, {duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)'});
      }).catch(() => {});
    },
    refreshReveal() { scan(document); },
    // Glide a scroller to a position (used to follow new messages).
    glideTo(scroller, top) { const st = smooth.get(scroller); if (!st || reducedNow()) { scroller.scrollTop = top; return; } st.target = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, top)); if (!st.running) st.current = scroller.scrollTop; start(st, scroller); },
  };
}
