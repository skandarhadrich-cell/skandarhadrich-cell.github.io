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
  const bars = document.querySelectorAll('.skill-fill');
  if (!bars.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.animationPlayState = 'running';
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });

  bars.forEach(bar => {
    bar.style.animationPlayState = 'paused';
    io.observe(bar);
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
