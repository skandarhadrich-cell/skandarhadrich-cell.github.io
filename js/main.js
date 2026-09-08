/* ============================================================
   0xmrerror.me — main.js
   ============================================================ */

'use strict';

/* ── nav scroll highlight ─────────────────────────────────── */
(function () {
  const nav = document.getElementById('nav');
  const links = document.querySelectorAll('.nav-links a');
  const sections = document.querySelectorAll('section[id]');

  window.addEventListener('scroll', () => {
    /* shrink border on scroll */
    nav.style.borderBottomColor = window.scrollY > 40
      ? 'rgba(30,45,61,.8)' : '';

    /* highlight active section */
    let current = '';
    sections.forEach(s => {
      if (window.scrollY >= s.offsetTop - 80) current = s.id;
    });

    /* bottom-of-page fallback: ensure the last section can always light up */
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      current = sections.length ? sections[sections.length - 1].id : current;
    }

    links.forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
  }, { passive: true });

  /* hamburger */
  const toggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav-links');
  if (toggle) {
    toggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      toggle.setAttribute('aria-expanded', navLinks.classList.contains('open'));
    });
  }

  /* close nav on link click (mobile) */
  links.forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));
})();

/* ── reveal on scroll ─────────────────────────────────────── */
(function () {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });

  els.forEach(el => io.observe(el));
})();

/* ── skill bar animation ──────────────────────────────────── */
(function () {
  const grids = document.querySelectorAll('.skill-grid');
  if (!grids.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.querySelectorAll('.skill-fill').forEach(bar => {
          bar.style.animationPlayState = 'running';
        });
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });

  grids.forEach(grid => {
    grid.querySelectorAll('.skill-fill').forEach(bar => {
      bar.style.animationPlayState = 'paused';
    });
    io.observe(grid);
  });
})();

/* ── writeup filters ─────────────────────────────────────── */
(function () {
  const btns = document.querySelectorAll('.filter-btn');
  const cards = document.querySelectorAll('.writeup-card');
  if (!btns.length || !cards.length) return;

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.filter;
      cards.forEach(card => {
        const show = f === 'all'
          || card.dataset.diff === f
          || card.dataset.platform === f;
        card.style.display = show ? '' : 'none';
      });
    });
  });
})();

/* ── writeup modal ───────────────────────────────────────── */

(function () {
  const overlay = document.getElementById('writeupModal');
  const content = document.getElementById('writeupContent');
  const title = document.getElementById('modalTitle');
  const closeBtn = document.getElementById('modalClose');
  if (!overlay || !content || !closeBtn) return;

  const cards = document.querySelectorAll('.writeup-card');
  const cache = new Map();

  const open = (card) => {
    const src = card.dataset.src;
    if (!src) return;

    title.textContent = '0xmrerror@terminal:~$ cat ' + src.replace(/^.*\//, '');

    if (cache.has(src)) {
      content.innerHTML = cache.get(src);
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      return;
    }

    content.innerHTML = '<p class="tok-comment">loading ' + src + '…</p>';
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    fetch(src)
      .then(r => {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      })
      .then(html => {
        cache.set(src, html);
        if (overlay.classList.contains('open')) content.innerHTML = html;
      })
      .catch(() => {
        const msg = '<p class="tok-comment">error: could not load ' + src + '</p>';
        cache.set(src, msg);
        content.innerHTML = msg;
      });
  };

  const close = () => {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  };

  cards.forEach(card => {
    card.addEventListener('click', () => open(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(card); }
    });
  });

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
})();

/* ── copy email ───────────────────────────────────────────── */
(function () {
  const emailBtn = document.getElementById('copyEmail');
  if (!emailBtn) return;
  emailBtn.addEventListener('click', () => {
    navigator.clipboard.writeText('skandar.hadrich@etudiant.enit.utm.tn').then(() => {
      emailBtn.classList.add('copied');
      emailBtn.textContent = '✓ copied';
      setTimeout(() => {
        emailBtn.classList.remove('copied');
        emailBtn.textContent = 'copy';
      }, 1500);
    });
  });
})();

/* ── uptime counter ───────────────────────────────────────── */
(function () {
  const el = document.getElementById('uptime');
  if (!el) return;
  const start = new Date('2026-07-01T00:00:00Z');
  setInterval(() => {
    const diff = Math.floor((Date.now() - start) / 1000);
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    el.textContent = `uptime: ${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, 1000);
})();
