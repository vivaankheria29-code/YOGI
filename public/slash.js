// Type "/" in the chat box to pick a skill or a connected app.
// Arrow keys move, Enter or Tab chooses, Esc closes. Long names stay on one line.
const $ = s => document.querySelector(s);

export function initSlash({onPick, openSkills}) {
  const prompt = $('#prompt'), form = $('#chatForm');
  const menu = document.createElement('div'); menu.className = 'slash-menu'; menu.id = 'slashMenu'; menu.setAttribute('role', 'listbox'); menu.hidden = true;
  form.append(menu);
  prompt.setAttribute('aria-controls', 'slashMenu'); prompt.setAttribute('aria-autocomplete', 'list');
  let items = [], active = 0, cache = null, cachedAt = 0, open = false;

  async function load(q) {
    if (cache && cache.query===q && Date.now() - cachedAt < 30000) return cache;
    const [skills, plugins] = await Promise.all([
      fetch('/api/skills?q='+encodeURIComponent(q)).then(r => r.ok ? r.json() : {skills: []}).catch(() => ({skills: []})),
      fetch('/api/plugins').then(r => r.ok ? r.json() : {apps: []}).catch(() => ({apps: []})),
    ]);
    cache = [
      ...(skills.skills || []).map(s => ({kind: 'skill', name: s.name, description: s.description || 'Skill'})),
      ...(plugins.apps || []).filter(a => a.callable).map(a => ({kind: 'app', name: a.name, description: a.description || 'Connected app'})),
    ];
    cache.query=q;cachedAt = Date.now(); return cache;
  }
  const query = () => { const m = /^\/([^\s]*)$/.exec(prompt.value.slice(0, prompt.selectionStart)); return m && prompt.selectionStart === prompt.value.length ? m[1].toLowerCase() : null; };
  function close() { open = false; menu.hidden = true; prompt.removeAttribute('aria-activedescendant'); prompt.setAttribute('aria-expanded', 'false'); }
  function render(list, q) {
    menu.replaceChildren();
    const head = document.createElement('div'); head.className = 'slash-head'; head.textContent = q ? `Skills and apps matching “${q}”` : 'Skills and apps'; menu.append(head);
    items = list.slice(0, 40);
    if (!items.length) {
      const empty = document.createElement('button'); empty.type = 'button'; empty.className = 'slash-item slash-empty';
      empty.innerHTML = '<b></b><small></small>'; empty.querySelector('b').textContent = q ? 'No skill or app matches' : 'No skills yet';
      empty.querySelector('small').textContent = 'Open Plugins → Skills to create one';
      empty.onmousedown = event => { event.preventDefault(); close(); prompt.value = ''; openSkills(); };
      menu.append(empty); active = -1; return;
    }
    items.forEach((item, i) => {
      const row = document.createElement('div'); row.className = 'slash-item'; row.id = 'slash-' + i; row.setAttribute('role', 'option');
      const tag = document.createElement('span'); tag.className = 'slash-tag ' + item.kind; tag.textContent = item.kind === 'skill' ? 'Skill' : 'App';
      const text = document.createElement('span'); text.className = 'slash-text';
      const name = document.createElement('b'); name.textContent = item.name; name.title = item.name;
      const desc = document.createElement('small'); desc.textContent = item.description; desc.title = item.description;
      text.append(name, desc); row.append(tag, text);
      row.onmousedown = event => { event.preventDefault(); pick(i); };
      row.onmousemove = () => { if (active !== i) { active = i; highlight(); } };
      menu.append(row);
    });
    active = 0; highlight();
  }
  function highlight() {
    menu.querySelectorAll('.slash-item').forEach((row, i) => row.setAttribute('aria-selected', String(i === active)));
    const row = menu.querySelector(`#slash-${active}`); if (row) { prompt.setAttribute('aria-activedescendant', row.id); row.scrollIntoView({block: 'nearest'}); }
  }
  function pick(i) {
    const item = items[i]; if (!item) return;
    close();
    prompt.value = item.kind === 'skill' ? `Use the ${item.name} skill: ` : `Use ${item.name} to `;
    prompt.dispatchEvent(new Event('input')); prompt.focus(); prompt.setSelectionRange(prompt.value.length, prompt.value.length);
    onPick?.(item);
  }
  async function update() {
    const q = query();
    if (q === null) { if (open) close(); return; }
    const all = await load(q); if (query() !== q) return;
    const list = all.filter(i => !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || (a.kind === b.kind ? 0 : a.kind === 'skill' ? -1 : 1));
    open = true; menu.hidden = false; prompt.setAttribute('aria-expanded', 'true'); render(list, q);
  }
  prompt.addEventListener('input', update);
  prompt.addEventListener('click', update);
  prompt.addEventListener('blur', () => setTimeout(close, 120));
  // Capture phase, so Enter picks an item instead of sending the message.
  prompt.addEventListener('keydown', event => {
    if (!open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopImmediatePropagation(); if (!items.length) return; active = (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; highlight(); }
    else if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey && items.length) { event.preventDefault(); event.stopImmediatePropagation(); pick(active); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  }, true);
  return {refresh() { cache = null; }};
}
