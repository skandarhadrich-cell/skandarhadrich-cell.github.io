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

/* The site opens dark. `auto` is still offered by the toggle and still
   follows the OS, it is just no longer what you get before choosing. */
const DEFAULT_THEME = 'dark';
const THEME_LABEL = { auto: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' };

function systemTheme() {
return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/* View Transitions where they exist, wrapped around the attribute
   change so the whole page crossfades instead of snapping. Guarded on
   two things the API cannot know about: the motion preference, and
   whether the page has painted yet -- a crossfade against the initial
   render is a flash, not a transition, and initTheme runs before first
   paint. */
let painted = false;
if (document.readyState === 'complete') painted = true;
else window.addEventListener('load', () => { painted = true; });

function transition(mutate) {
  if (document.startViewTransition && painted
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(mutate);
  } else {
    mutate();
  }
}

function applyTheme(pref) {
const resolved = !pref || pref === 'auto' ? systemTheme() : pref;
transition(() => {
  document.documentElement.dataset.theme = resolved;
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'light' ? '#ffffff' : '#080b10';
});
}

function applyAccent(name) {
transition(() => {
  if (name) document.documentElement.dataset.accent = name;
  else delete document.documentElement.dataset.accent;
});
}

(function initTheme() {
let pref = DEFAULT_THEME;
try { pref = localStorage.getItem(THEME_KEY) || DEFAULT_THEME; } catch { /* private mode */ }
if (!Object.prototype.hasOwnProperty.call(THEME_LABEL, pref)) pref = DEFAULT_THEME;
applyTheme(pref);
try { applyAccent(localStorage.getItem(ACCENT_KEY) || ''); } catch { /* ignore */ }

$$('[data-theme-toggle]').forEach(btn => {
  // the markup ships `dark`, but a stored preference wins: keep the
  // button's own state and its label honest either way
  btn.dataset.themePref = pref;
  btn.setAttribute('aria-label', THEME_LABEL[pref]);
  btn.addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    const cur = btn.dataset.themePref || DEFAULT_THEME;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    btn.dataset.themePref = next;
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
    btn.setAttribute('aria-label', THEME_LABEL[next]);
    toast(THEME_LABEL[next]);
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
    let pref = DEFAULT_THEME;
    try { pref = localStorage.getItem(THEME_KEY) || DEFAULT_THEME; } catch { /* ignore */ }
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
/* The reveal classes carry the hidden state *and* the stagger delay
   (--reveal-delay), and a card keeps transitioning hover changes long
   after it has arrived. Leaving the classes on would make every hover
   on a revealed project card run at the reveal's timing, so once the
   fade has finished they come off: the element is then an ordinary
   .card again, at full opacity, with its own transitions. */
const show = (el) => {
  el.classList.add('is-in');
  el.addEventListener('transitionend', (e) => {
    if (e.target === el && e.propertyName === 'opacity') {
      el.classList.remove('reveal', 'is-in');
    }
  }, { once: true });
};

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

/* ══ typing section intros ═════════════════════════════════
 The `$ cat …` line above a section types itself once, the first
 time it scrolls into view. Purely decorative: the finished
 command is what ships in the HTML, and this only runs when motion
 is allowed. Without JS -- or with an observer the browser never
 provides -- the line is simply there, which is what it always was. */
(function typeCmds() {
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
if (!('IntersectionObserver' in window)) return;
const cmds = $$('.cmd-line .p-cmd');
if (!cmds.length) return;

const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const el = e.target;
    const full = el.textContent;
    if (!full) return;
    el.textContent = '';
    el.classList.add('is-typing');
    // the clip is in ch and the font is monospace, so one character is
    // exactly one ch; the jitter below only makes it read as typing
    // rather than as a width animation
    let i = 0;
    const step = () => {
      i += 1;
      el.style.maxWidth = i + 'ch';
      el.textContent = full.slice(0, i);
      if (i < full.length) {
        setTimeout(step, 16 + Math.random() * 42);
      } else {
        el.classList.remove('is-typing');
        el.style.maxWidth = '';
      }
    };
    setTimeout(step, 200);
  });
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.4 });

cmds.forEach(el => io.observe(el));
})();

/* ══ stat count-up ═════════════════════════════════════════
 Each stat rolls from zero when the strip first enters view. The
 final value is what ships in the HTML (build.py only adds the
 data-count hooks), so this animates *through* the truth rather
 than to it, and only when motion is allowed. Tabular figures in
 components.css keep every step the same width. */
(function countStats() {
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
if (!('IntersectionObserver' in window)) return;
const nums = $$('.stat b[data-count]');
if (!nums.length) return;

const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const el = e.target;
    const end = parseInt(el.dataset.count, 10);
    if (Number.isNaN(end)) return;
    const pre = el.dataset.prefix || '';
    const post = el.dataset.suffix || '';
    const dur = 750;
    const t0 = performance.now();
    el.textContent = pre + '0' + post;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);   // ease-out: fast, then settle
      el.textContent = pre + Math.round(end * eased) + post;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = pre + end + post;
    };
    requestAnimationFrame(tick);
  });
}, { threshold: 0.6 });

nums.forEach(el => io.observe(el));
})();

/* ══ card spotlight ════════════════════════════════════════
 The accent pool that follows the pointer across a card (the
 ::before in components.css). One passive listener for the whole
 page, writing two custom properties on the card under the
 pointer, rAF-throttled. Fine pointers only -- the CSS hides the
 ::before on touch, so nothing lights there. */
(function spotlight() {
if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
let card = null, x = 0, y = 0, queued = false;

document.addEventListener('pointermove', (e) => {
  const hit = e.target.closest
    ? e.target.closest('.card, .writeup-card, .cert-row')
    : null;
  if (hit !== card) {
    if (card) {
      card.style.removeProperty('--mx');
      card.style.removeProperty('--my');
    }
    card = hit;
  }
  if (!card) return;
  const r = card.getBoundingClientRect();
  x = e.clientX - r.left;
  y = e.clientY - r.top;
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (!card) return;
    card.style.setProperty('--mx', x + 'px');
    card.style.setProperty('--my', y + 'px');
  });
}, { passive: true });
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
    // The links are root-absolute (`/#experience`) so they still work from a
    // write-up page, but this compared them against a bare `#experience` and
    // so never matched anything: the rail marker and the nav's current-item
    // colour were dead on every page. Strip the leading slash and compare.
    const href = (a.getAttribute('href') || '').replace(/^\//, '');
    if (href === '#' + current) a.setAttribute('aria-current', 'true');
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
