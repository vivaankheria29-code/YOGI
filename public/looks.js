// Personalise: accent, text and chat-bubble colours, cursor style, and a
// background (built-in presets, a solid colour, or your own photo).
// Each interface remembers its own look; the cursor choice is shared.
const $ = s => document.querySelector(s);
const root = document.documentElement;

export const ACCENTS = [['Red', '#D71921'], ['Blue', '#0A84FF'], ['Green', '#30D158'], ['Orange', '#FF9F0A'], ['Pink', '#FF375F'], ['Purple', '#BF5AF2'], ['Teal', '#40C8E0'], ['Marigold', '#F2A33A'], ['White', '#FFFFFF']];
export const INKS = [['White', '#FFFFFF'], ['Soft white', '#E6E4DE'], ['Cream', '#F4EFE4'], ['Ice', '#DDEBFF'], ['Black', '#111111'], ['Navy', '#1D2B53']];
export const BUBBLES = [['WhatsApp green', '#005C4B'], ['Mint', '#DCF8C6'], ['Blue', '#0A84FF'], ['Charcoal', '#2B2B2B'], ['Violet', '#7E57C2'], ['Marigold', '#F2A33A'], ['Red', '#D71921'], ['Teal', '#1F7A8C'], ['Rose', '#E91E63'], ['Slate', '#455A64']];
export const BACKGROUNDS = [
  {id: 'midnight', label: 'Midnight', css: '#0B0F1A', base: '#0B0F1A'},
  {id: 'graphite', label: 'Graphite', css: '#18191C', base: '#18191C'},
  {id: 'ocean', label: 'Ocean', css: 'linear-gradient(160deg,#0B2545,#13315C 55%,#134074)', base: '#13315C'},
  {id: 'sunset', label: 'Sunset', css: 'linear-gradient(160deg,#2A1240,#7A2E5A 55%,#C2564A)', base: '#5A2050'},
  {id: 'forest', label: 'Forest', css: 'linear-gradient(160deg,#0C1A12,#173524 55%,#21462F)', base: '#173524'},
  {id: 'aurora', label: 'Aurora', css: 'radial-gradient(60% 50% at 18% 8%,rgba(37,99,235,.55),transparent 70%),radial-gradient(50% 45% at 85% 15%,rgba(16,185,129,.45),transparent 70%),#070A12', base: '#070A12'},
  {id: 'dots', label: 'Dot grid', css: 'radial-gradient(rgba(255,255,255,.09) 1.2px,transparent 1.5px) 0 0/18px 18px,#0E0E10', base: '#0E0E10'},
  {id: 'paper', label: 'Paper (light)', css: '#F3F0E8', base: '#F3F0E8'},
];
const CURSORS = [['auto', 'Match the interface'], ['matrix', 'Dot-matrix arrow'], ['ring', 'Dot and ring'], ['petal', 'Petal'], ['comet', 'Comet trail'], ['system', 'System cursor']];

function luminance(hex) {
  const v = hex.replace('#', ''), n = v.length === 3 ? v.split('').map(c => c + c).join('') : v;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
}
const readable = hex => luminance(hex) > .42 ? '#111111' : '#FFFFFF';
const validHex = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));

export function initLooks({prefs, save, toast}) {
  prefs.looks = prefs.looks && typeof prefs.looks === 'object' ? prefs.looks : {};
  const style = document.createElement('style'); style.id = 'lookStyle'; document.head.append(style);
  const layer = document.createElement('div'); layer.className = 'custom-bg'; layer.setAttribute('aria-hidden', 'true'); document.body.prepend(layer);
  const ui = () => root.dataset.ui || 'core';
  const look = () => {
    const entry=(prefs.looks[ui()] ||= {}), mode=root.dataset.theme==='light'?'light':'dark';
    entry.modes ||= {};
    if(!entry.modes[mode]) {
      const legacy=ui()==='core'?prefs.colorSchemes?.[mode]:null;
      entry.modes[mode]={...Object.fromEntries(Object.entries(entry).filter(([key])=>key!=='modes')),...(legacy?{accent:legacy.accent,ink:legacy.text,panel:legacy.panel,face:legacy.face,bg:legacy.background}:{})};
    }
    return entry.modes[mode];
  };
  const imageKey = () => 'yogi.bg.' + ui();
  const readImage = () => { try { return localStorage.getItem(imageKey()) || ''; } catch { return ''; } };

  function apply() {
    const l = look(), u = ui(), vars = [];
    if (validHex(l.accent)) {
      const a = l.accent;
      vars.push(`--accent:${a}`, `--core-red:${a}`, `--core-red-hover:${a}`, `--core-red-ink:${a}`, `--accent-ink:${a}`, `--focus:${a}`, `--red:${a}`, `--live:${a}`, `--on-accent:${readable(a)}`, `--on-red:${readable(a)}`,
        `--core-red-soft:color-mix(in srgb,${a} 18%,transparent)`, `--core-red-line:color-mix(in srgb,${a} 50%,transparent)`);
      vars.push(u === 'marigold' ? `--dot-on:${a}` : `--dot-red:${a}`);
    }
    if (validHex(l.ink)) {
      vars.push(`--ink:${l.ink}`, `--cursor-ink:${l.ink}`, `--orb-eye:${l.ink}`, `--ink-2:color-mix(in srgb,${l.ink} 80%,transparent)`, `--ink-3:color-mix(in srgb,${l.ink} 62%,transparent)`);
      if (u === 'core') vars.push(`--dot-on:${l.ink}`);
    }
    if (validHex(l.panel)) vars.push(`--surface:${l.panel}`,`--solid:${l.panel}`,`--surface-2:color-mix(in srgb,${l.panel} 92%,var(--ink))`,`--surface-3:color-mix(in srgb,${l.panel} 84%,var(--ink))`);
    if (validHex(l.face)) vars.push(`--dot-on:${l.face}`,`--orb-eye:${l.face}`);
    if (validHex(l.bubble)) vars.push(`--user-bubble:${l.bubble}`);
    let css = vars.length ? `:root{${vars.map(v => v + ' !important').join(';')}}` : '';
    if (validHex(l.bubble)) css += `.msg.user .bubble{color:${readable(l.bubble)}!important}`;
    const image = l.bg === 'image' ? readImage() : '';
    const preset = BACKGROUNDS.find(b => b.id === l.bg);
    let background = '';
    if (image) { const dim = Math.max(0, Math.min(.85, (Number(l.dim ?? 35)) / 100)); background = `linear-gradient(rgba(0,0,0,${dim}),rgba(0,0,0,${dim})),url("${image}") center/cover no-repeat`; }
    else if (preset) background = preset.css;
    else if (validHex(l.bg)) background = l.bg;
    if (background) {
      css += `.custom-bg{display:block!important}.ambient{display:none!important}.topbar{background:transparent!important}body,:root[data-ui] body{background:${preset?.base || (validHex(l.bg) ? l.bg : '#000')}!important}`;
      layer.style.background = background;
    } else layer.style.background = '';
    style.textContent = css;
    root.dataset.cursorStyle = prefs.cursorStyle || 'auto';
    paint();
  }

  // ---------- Controls ----------
  const swatchRow = (key, list) => {
    const row = $(`.swatches[data-look="${key}"]`); if (!row) return;
    row.replaceChildren();
    const make = (label, value, color) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.dataset.value = value; b.setAttribute('aria-label', label); b.title = label;
      if (color) b.style.setProperty('--sw', color); else b.classList.add('swatch-default');
      b.onclick = () => { look()[key] = value || undefined; if (!value) delete look()[key]; save(); apply(); };
      row.append(b);
    };
    make('Interface default', '', '');
    for (const [label, hex] of list) make(label, hex, hex);
    const custom = document.createElement('label'); custom.className = 'swatch swatch-custom'; custom.title = 'Pick any colour';
    const input = document.createElement('input'); input.type = 'color'; input.setAttribute('aria-label', 'Custom ' + key + ' colour');
    input.oninput = () => { look()[key] = input.value.toUpperCase(); save(); apply(); };
    const hex=document.createElement('input');hex.type='text';hex.maxLength=7;hex.placeholder='#RRGGBB';hex.className='look-hex';hex.setAttribute('aria-label',key+' hex colour');
    hex.oninput=()=>{const valid=validHex(hex.value);hex.setAttribute('aria-invalid',String(!valid));if(valid){look()[key]=hex.value.toUpperCase();save();apply();}};
    custom.append(input); row.append(custom,hex);
  };
  function paint() {
    const l = look();
    $('#lookUiName') && ($('#lookUiName').textContent = {core: 'Core', glass: 'Glass', marigold: 'Marigold'}[ui()]);
    for (const key of ['accent', 'ink', 'bubble', 'panel', 'face']) {
      const row = $(`.swatches[data-look="${key}"]`); if (!row) continue;
      const hex=row.querySelector('.look-hex');if(hex&&document.activeElement!==hex)hex.value=l[key]||'';
      let matched = false;
      row.querySelectorAll('button.swatch').forEach(b => { const on = (b.dataset.value || '') === (l[key] || ''); b.setAttribute('aria-pressed', String(on)); matched ||= on; });
      const custom = row.querySelector('.swatch-custom'); custom.classList.toggle('on', !matched && !!l[key]);
      if (validHex(l[key])) { custom.style.setProperty('--sw', l[key]); custom.querySelector('input').value = l[key]; }
    }
    const selected = !l.bg ? '' : validHex(l.bg) ? 'color' : l.bg;
    document.querySelectorAll('.bg-tile').forEach(t => t.setAttribute('aria-pressed', String((t.dataset.bg || '') === selected)));
    if ($('#bgDim')) { $('#bgDim').value = l.dim ?? 35; $('#bgDimRow').hidden = l.bg !== 'image'; }
    if ($('#cursorStyle')) $('#cursorStyle').value = prefs.cursorStyle || 'auto';
  }
  swatchRow('accent', ACCENTS); swatchRow('ink', INKS); swatchRow('bubble', BUBBLES); swatchRow('panel', [['Black','#000000'],['Graphite','#18191C'],['White','#FFFFFF']]); swatchRow('face', INKS);
  const tiles = $('#bgTiles');
  if (tiles) {
    const tile = (id, label, css) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'bg-tile'; b.dataset.bg = id; b.style.setProperty('--tile', css); b.innerHTML = '<span></span>'; b.querySelector('span').textContent = label; b.onclick = () => { if (id) look().bg = id; else delete look().bg; save(); apply(); }; tiles.append(b); return b; };
    tile('', 'Default', 'repeating-linear-gradient(45deg,#2a2a2e 0 6px,#1d1d20 6px 12px)');
    for (const b of BACKGROUNDS) tile(b.id, b.label, b.css);
    const colorTile = tile('color', 'Solid colour', 'conic-gradient(#f43f5e,#f59e0b,#22c55e,#06b6d4,#6366f1,#f43f5e)');
    const picker = document.createElement('input'); picker.type = 'color'; picker.className = 'bg-color-input'; picker.setAttribute('aria-label', 'Background colour'); picker.value = '#101418';
    colorTile.onclick = () => picker.click(); picker.oninput = () => { look().bg = picker.value.toUpperCase(); save(); apply(); }; tiles.append(picker);
    const photo = tile('image', 'Your photo', 'linear-gradient(135deg,#3a3f4a,#20232a)');
    photo.onclick = () => $('#bgFile').click();
  }
  $('#bgFile')?.addEventListener('change', async () => {
    const file = $('#bgFile').files?.[0]; $('#bgFile').value = '';
    if (!file || !/^image\//.test(file.type)) return;
    try {
      // Shrink to at most 2000 px and re-encode, so the photo fits in browser storage.
      const bitmap = await createImageBitmap(file); const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL('image/jpeg', .84);
      try { localStorage.setItem(imageKey(), data); } catch { data = canvas.toDataURL('image/jpeg', .6); localStorage.setItem(imageKey(), data); }
      look().bg = 'image'; save(); apply(); toast('Background photo set for this interface.');
    } catch { toast('That photo could not be used. Try a JPG or PNG under 15 MB.'); }
  });
  $('#bgDim')?.addEventListener('input', () => { look().dim = Number($('#bgDim').value); save(); apply(); });
  $('#cursorStyle')?.addEventListener('change', () => { prefs.cursorStyle = $('#cursorStyle').value; save(); apply(); });
  if ($('#cursorStyle')) $('#cursorStyle').replaceChildren(...CURSORS.map(([v, l]) => new Option(l, v)));
  $('#resetLook')?.addEventListener('click', () => { delete prefs.looks[ui()].modes[root.dataset.theme==='light'?'light':'dark']; if(ui()==='core'&&prefs.colorSchemes) delete prefs.colorSchemes[root.dataset.theme==='light'?'light':'dark']; try { localStorage.removeItem(imageKey()); } catch {} save(); apply(); toast('This interface is back to its own colours and background.'); });
  new MutationObserver(apply).observe(root, {attributes: true, attributeFilter: ['data-ui','data-theme']});
  apply();
  return {apply};
}
