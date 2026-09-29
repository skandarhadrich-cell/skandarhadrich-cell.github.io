/* ============================================================
   0xmrerror.me — main.js
   Site-wide behaviour: theme, nav, rail, reveal, filters,
   command palette, clipboard. No dependencies.
   ============================================================ */

/* Everything below is scoped to this file. Both scripts used to declare
   top-level `const $`, and a write-up page loads both — the second one
   threw a SyntaxError and silently lost the table of contents, the code
   copy buttons and the flag toggles.  An IIFE makes that impossible. */
(function () {

'use strict';

'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ── toast ───────────────────────────────────────────────── */
let toastTimer;
function toast(msg) {
let el = $('.toast');
if (!el) {
  el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
}
el.textContent = msg;
requestAnimationFrame(() => el.classList.add('is-on'));
clearTimeout(toastTimer);
toastTimer = setTimeout(() => el.classList.remove('is-on'), 1900);
}

/* ── copy to clipboard ───────────────────────────────────── */
async function copyText(text) {
try {
  await navigator.clipboard.writeText(text);
  return true;
} catch {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
}

/* ══ theme + accent ═══════════════════════════════════════ */
const THEME_KEY = '0xmrerror:theme';
const ACCENT_KEY = '0xmrerror:accent';
const ACCENTS = ['', 'phosphor', 'nord', 'crimson'];

function systemTheme() {
return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(pref) {
const resolved = !pref || pref === 'auto' ? systemTheme() : pref;
document.documentElement.dataset.theme = resolved;
const meta = $('meta[name="theme-color"]');
if (meta) meta.content = resolved === 'light' ? '#ffffff' : '#080b10';
}

function applyAccent(name) {
if (name) document.documentElement.dataset.accent = name;
else delete document.documentElement.dataset.accent;
}

(function initTheme() {
let pref = 'auto';
try { pref = localStorage.getItem(THEME_KEY) || 'auto'; } catch { /* private mode */ }
applyTheme(pref);
try { applyAccent(localStorage.getItem(ACCENT_KEY) || ''); } catch { /* ignore */ }

$$('[data-theme-toggle]').forEach(btn => {
  btn.addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    const cur = btn.dataset.themePref || 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    btn.dataset.themePref = next;
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
    const label = { auto: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' };
    btn.setAttribute('aria-label', label[next]);
    toast(label[next]);
  });
});

$$('[data-accent-toggle]').forEach(btn => {
  btn.addEventListener('click', () => {
    let cur = '';
    try { cur = localStorage.getItem(ACCENT_KEY) || ''; } catch { /* ignore */ }
    const next = ACCENTS[(ACCENTS.indexOf(cur) + 1) % ACCENTS.length];
    applyAccent(next);
    try { localStorage.setItem(ACCENT_KEY, next); } catch { /* ignore */ }
    toast(next ? `Accent: ${next}` : 'Accent: default');
  });
});

window.matchMedia('(prefers-color-scheme: light)')
  .addEventListener('change', () => {
    let pref = 'auto';
    try { pref = localStorage.getItem(THEME_KEY) || 'auto'; } catch { /* ignore */ }
    if (pref === 'auto') applyTheme('auto');
  });
})();

/* ══ reveal on scroll ═════════════════════════════════════
 .reveal starts at opacity 0 in CSS, which means anything that
 stops this from running leaves the page blank.  Three layers
 of defence: no observer, an element already on screen, and a
 timeout.  The animation is a nicety; the content is not.     */
(function reveal() {
const els = $$('.reveal');
if (!els.length) return;
const show = (el) => el.classList.add('is-in');

if (!('IntersectionObserver' in window)) {
  els.forEach(show);
  return;
}

const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    show(e.target);
    io.unobserve(e.target);
  });
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

els.forEach(el => io.observe(el));

// an element already within the viewport when the observer is attached
// may never fire a callback, so reveal it up front
requestAnimationFrame(() => {
  els.forEach(el => {
    if (el.classList.contains('is-in')) return;
    if (el.getBoundingClientRect().top < window.innerHeight) show(el);
  });
});

// last resort: nothing may stay hidden
setTimeout(() => els.forEach(show), 1500);
})();

/* ══ nav: sticky state, active section, mobile menu ═══════ */
(function nav() {
const bar = $('#nav');
const links = $$('[data-nav-link]');
const sections = $$('section[id]');
const toggle = $('#navToggle');
const list = $('#navLinks');

if (toggle && list) {
  const setOpen = (open) => {
    list.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!list.classList.contains('is-open')));
  list.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
}

if (!sections.length) return;
let ticking = false;

function update() {
  ticking = false;
  const y = window.scrollY;
  if (bar) bar.classList.toggle('is-stuck', y > 24);

  const probe = y + (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 58) + 90;
  let current = sections[0].id;
  for (const s of sections) {
    if (s.offsetTop <= probe) current = s.id;
  }
  if (y + window.innerHeight >= document.documentElement.scrollHeight - 4) {
    current = sections[sections.length - 1].id;
  }
  links.forEach(a => {
    if (a.getAttribute('href') === '#' + current) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  });

  const fill = $('.rail-progress i');
  if (fill) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    fill.style.width = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + '%';
  }
}

const onScroll = () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(update);
};
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll, { passive: true });
update();
})();

/* ══ writeup filters ══════════════════════════════════════ */
(function filters() {
const bar = $('[data-filters]');
if (!bar) return;
const cards = $$('[data-writeup-card]');
const groups = {};
$$('[data-filter-group]', bar).forEach(b => {
  (groups[b.dataset.filterGroup] ||= []).push(b);
});
const state = { type: 'all', diff: 'all', platform: 'all' };
const countEl = $('[data-filter-count]');

// restore from ?type=re&diff=hard
const params = new URLSearchParams(location.search);
groups && Object.keys(groups).forEach(g => {
  const v = params.get(g);
  if (v && groups[g].some(b => b.dataset.filterValue === v)) state[g] = v;
});

function apply(writeUrl) {
  Object.keys(state).forEach(g => {
    (groups[g] || []).forEach(b => {
      const on = b.dataset.filterValue === state[g];
      b.setAttribute('aria-pressed', String(on));
    });
  });
  let shown = 0;
  cards.forEach(c => {
    const ok = Object.keys(state).every(g => state[g] === 'all' || c.dataset[g] === state[g]);
    c.classList.toggle('is-hidden', !ok);
    if (ok) shown++;
  });
  if (countEl) {
    countEl.textContent = shown === cards.length
      ? `${cards.length} writeups`
      : `${shown} of ${cards.length}`;
  }
  if (writeUrl) {
    const q = new URLSearchParams();
    Object.keys(state).forEach(g => { if (state[g] !== 'all') q.set(g, state[g]); });
    const qs = q.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }
}

$$('[data-filter-group]', bar).forEach(btn => {
  btn.addEventListener('click', () => {
    state[btn.dataset.filterGroup] = btn.dataset.filterValue;
    apply(true);
  });
});

apply(false);
})();

/* ══ copy buttons ═════════════════════════════════════════ */
document.addEventListener('click', (e) => {
const codeBtn = e.target.closest('[data-copy-code]');
if (codeBtn) {
  const pre = codeBtn.closest('pre');
  if (pre) {
    copyText(pre.innerText).then(ok => {
      if (!ok) return toast('Copy failed');
      codeBtn.textContent = 'copied ✓';
      codeBtn.classList.add('is-done');
      toast('Code copied');
      setTimeout(() => {
        codeBtn.textContent = 'copy';
        codeBtn.classList.remove('is-done');
      }, 1600);
    });
  }
  return;
}

const mailBtn = e.target.closest('[data-copy-mail]');
if (mailBtn) {
  copyText(mailBtn.dataset.copyMail).then(ok => {
    toast(ok ? 'Email copied to clipboard' : 'Copy failed');
  });
}
});

/* ══ command palette ══════════════════════════════════════ */
(function palette() {
const root = $('#palette');
if (!root) return;
const input = $('#paletteInput');
const listEl = $('#paletteList');
const paletteBtn = $('[data-palette-open]');
let index = null;
let items = [];
let active = 0;

const statics = $$('[data-palette-item]').map(el => ({
  label: el.dataset.paletteItem,
  hint: el.dataset.paletteHint || 'go to',
  kind: el.dataset.paletteKind || 'section',
  url: el.getAttribute('href') || el.dataset.paletteUrl
})).filter(i => i.url);

function score(item, q) {
  const hay = (item.label + ' ' + (item.hint || '') + ' ' + (item.data || '')).toLowerCase();
  const needle = q.toLowerCase();
  const at = hay.indexOf(needle);
  if (at === -1) return -1;
  if (item.label.toLowerCase().startsWith(needle)) return 1000 - item.label.length;
  return 500 - at - item.label.length * 0.2;
}

function loadIndex() {
  if (index) return Promise.resolve(index);
  // Root-absolute, not relative: every write-up lives in its own
  // subdirectory, so `search-index.json` would resolve to
  // /writeups/<slug>/search-index.json and 404 on all thirteen pages.
  return fetch('/search-index.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : { writeups: [] }))
    .then(data => { index = data; return index; })
    .catch(() => { index = { writeups: [] }; return index; });
}

/* Write-up titles ship twice: once in the server-rendered hidden list (so the
   palette is usable before the fetch resolves, and if it fails) and once in
   /search-index.json (which carries tags for matching). Merge them by URL so
   the index copy wins — it is the only one with a searchable tag string. */
function writeupEntries() {
  const dynamic = (index?.writeups || []).map(w => ({
    label: w.t, hint: w.d || '', kind: 'writeup', url: w.u, data: (w.g || []).join(' ')
  }));
  if (!dynamic.length) return statics.filter(i => i.kind === 'writeup');
  const seen = new Set(dynamic.map(i => i.url));
  return dynamic.concat(statics.filter(i => i.kind === 'writeup' && !seen.has(i.url)));
}

function render(q) {
  const needle = q.trim();
  const sections = statics.filter(i => i.kind !== 'writeup');
  let rows;
  if (needle) {
    const pool = sections.concat(writeupEntries());
    rows = pool
      .map(r => ({ r, s: score(r, needle) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map(x => x.r);
  } else {
    // no query: sections first, then a few recent write-ups as suggestions
    rows = sections.concat(writeupEntries().slice(0, 5));
  }
  items = rows;
  active = 0;
  if (!rows.length) {
    listEl.innerHTML = '<li class="palette-empty">no matches — try “sql”, “frida”, “web”</li>';
    return;
  }
  listEl.innerHTML = rows.map((r, i) => {
    const mark = needle
      ? r.label.replace(new RegExp('(' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i'), '<mark>$1</mark>')
      : r.label;
    const kindTag = { section: './', writeup: 'cat', external: '→' }[r.kind] || './';
    return `<li class="palette-item" role="option" aria-selected="${i === 0}" data-url="${r.url}">
      <span class="mono faint" style="font-size:var(--fs-3xs)">${kindTag}</span>
      <span>${mark}</span>
      <span class="k">${(r.hint || '').slice(0, 46)}</span>
    </li>`;
  }).join('');
}

function open() {
  root.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  input.value = '';
  render('');
  loadIndex().then(() => { if (input.value) render(input.value); else render(''); });
  setTimeout(() => input.focus(), 30);
  document.addEventListener('keydown', onKey);
}

function close() {
  root.classList.remove('is-open');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onKey);
  paletteBtn?.focus();
}

function onKey(e) {
  if (e.key === 'Escape') { close(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const rows = $$('.palette-item', listEl);
    if (!rows.length) return;
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
    rows.forEach((r, i) => r.setAttribute('aria-selected', String(i === active)));
    rows[active].scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key === 'Enter') {
    const row = $$('.palette-item', listEl)[active];
    if (row) { close(); location.href = row.dataset.url; }
  }
}

input.addEventListener('input', () => render(input.value));
root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
listEl.addEventListener('click', (e) => {
  const row = e.target.closest('.palette-item');
  if (!row) return;
  close();
  location.href = row.dataset.url;
});
paletteBtn?.addEventListener('click', open);
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    root.classList.contains('is-open') ? close() : open();
  }
});
})();

/* ── year in footer ──────────────────────────────────────── */
$$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

/* ── days-since counter (replaces the fake "uptime" badge) ── */
$$('[data-since]').forEach(el => {
const start = new Date(el.dataset.since + 'T00:00:00Z');
if (Number.isNaN(start.getTime())) return;
const days = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
el.textContent = el.dataset.sincePrefix
  ? `${el.dataset.sincePrefix} ${days} days`
  : `${days} days`;
});

})();
