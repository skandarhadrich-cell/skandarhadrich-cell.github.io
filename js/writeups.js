/* ============================================================
   0xmrerror.me — writeups.js
   Enhances a rendered writeup page: table of contents, code
   copy buttons, flag spoilers, reading progress.
   ============================================================ */

/* Scoped to this file; see the note in main.js. */
(function () {

'use strict';

'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const article = $('[data-article]');
if (article) {

/* ── heading ids + anchors ───────────────────────────── */
const slugify = (s) => s.toLowerCase()
  .replace(/<[^>]+>/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const headings = $$('h2, h3', article).filter(h => !h.closest('.no-toc'));
const used = new Set();
headings.forEach(h => {
  if (!h.id) {
    let id = slugify(h.textContent) || 'section';
    while (used.has(id)) id += '-2';
    used.add(id);
    h.id = id;
  }
});

/* ── table of contents ────────────────────────────────── */
const toc = $('[data-toc]');
if (toc && headings.length) {
  const ol = document.createElement('ol');
  headings.forEach((h, i) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    if (h.tagName === 'H3') li.style.paddingLeft = '0.9rem';
    a.dataset.tocTarget = h.id;
    li.appendChild(a);
    ol.appendChild(li);
  });
  toc.appendChild(ol);

  /* Scrollspy. The observer band is deliberately high on the page, so a
     heading only counts once you have actually read into its section. But
     there is a lot of scrolling that happens between two headings — prose,
     a long code block — and during that stretch nothing would be marked.
     So the active entry falls back to the last heading scrolled past. */
  if ('IntersectionObserver' in window) {
    const links = new Map($$('[data-toc-target]', toc).map(a => [a.dataset.tocTarget, a]));
    const seen = new Set();
    let last = null;

    const paint = () => {
      const id = seen.size ? headings.find(h => seen.has(h.id))?.id : last;
      links.forEach(a => a.classList.toggle('is-active', a.dataset.tocTarget === id));
    };

    const spy = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          seen.add(e.target.id);
          // the topmost visible heading becomes the new fallback
          if (!last || e.target.getBoundingClientRect().top < 0) last = e.target.id;
        } else {
          seen.delete(e.target.id);
          if (last === e.target.id) {
            const above = headings.filter(h => h.getBoundingClientRect().top <= 0);
            last = above.length ? above[above.length - 1].id : null;
          }
        }
      });
      paint();
    }, { rootMargin: '-15% 0px -70% 0px' });
    headings.forEach(h => spy.observe(h));

    // keep the fallback honest on a fast scroll, where the observer can
    // coalesce several headings into one callback
    let ticking = false;
    const resync = () => {
      ticking = false;
      if (seen.size) { paint(); return; }
      const above = headings.filter(h => h.getBoundingClientRect().top <= window.innerHeight * 0.3);
      last = above.length ? above[above.length - 1].id : null;
      paint();
    };
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(resync);
    }, { passive: true });
  }
}

/* ── copy buttons on every code block ─────────────────── */
$$('pre', article).forEach(pre => {
  if (!pre.querySelector('code')) return;
  const btn = document.createElement('button');
  btn.className = 'code-copy';
  btn.type = 'button';
  btn.dataset.copyCode = '';
  btn.textContent = 'copy';
  btn.setAttribute('aria-label', 'Copy code block');
  pre.appendChild(btn);
});

/* ── flags ───────────────────────────────────────────────
   One toggle blurs every flag on the page; clicking an
   individual flag reveals just that one.  State is kept in
   localStorage so "I am skimming for the technique, not the
   answer" survives navigation.                            */
const FLAG_KEY = '0xmrerror:hideFlags';
const flags = $$('.flag', article);
const toggle = $('[data-flag-toggle]');

if (flags.length) {
  let stored = '0';
  try { stored = localStorage.getItem(FLAG_KEY) || '0'; } catch { /* private mode */ }
  let hiding = stored === '1';

  const paint = () => {
    article.toggleAttribute('data-hide-flags', hiding);
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(hiding));
      toggle.textContent = hiding ? '🚩 flags hidden' : '🚩 hide flags';
    }
  };

  paint();

  toggle?.addEventListener('click', () => {
    hiding = !hiding;
    flags.forEach(f => f.removeAttribute('data-revealed'));
    try { localStorage.setItem(FLAG_KEY, hiding ? '1' : '0'); } catch { /* ignore */ }
    paint();
  });

  flags.forEach(flag => {
    if (flag.closest('pre')) return;   // inside a terminal dump: not a target
    flag.setAttribute('role', 'button');
    flag.setAttribute('tabindex', '0');
    flag.setAttribute('title', 'Reveal this flag');
    const reveal = (e) => {
      e.stopPropagation();
      flag.toggleAttribute('data-revealed');
      flag.setAttribute('title', flag.hasAttribute('data-revealed')
        ? 'Hide this flag' : 'Reveal this flag');
    };
    flag.addEventListener('click', reveal);
    flag.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(e); }
    });
  });
}

/* ── reading progress ─────────────────────────────────
   Measured against the article, not the document: on a write-up
   the nav and the next/prev footer sit outside the text, and
   counting them makes the bar reach 100% while you are still
   reading. Long pages cap the denominator so a 40 000-word
   page does not feel like it never moves.                     */
const bar = $('[data-read-progress]');
if (bar) {
  const fill = bar.firstElementChild;
  let ticking = false;
  const update = () => {
    ticking = false;
    const rect = article.getBoundingClientRect();
    const scrolled = -rect.top;
    const readable = Math.max(rect.height - window.innerHeight * 0.4, window.innerHeight);
    const done = Math.min(1, Math.max(0, scrolled / readable));
    fill.style.transform = 'scaleX(' + done.toFixed(4) + ')';
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
  // the article can change height once fonts land and code is re-wrapped
  if ('ResizeObserver' in window) new ResizeObserver(update).observe(article);
  if (document.fonts?.ready) document.fonts.ready.then(update);
}
}

})();
