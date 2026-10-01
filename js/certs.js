/* ============================================================
   certs.js — the certificate viewer
   Opens a certificate image in the overlay defined by certlightbox().

   Each row carries its full-size image inside a <template>, which is inert and
   so never fetched. Cloning it in on click is what keeps the eight 1200px
   renders off the initial load -- the rows themselves only load the 640px
   thumbnails. The trigger is a plain <a> stretched over the row, so if this
   file never runs the link still shows the certificate, just on its own page.

   The <template> is looked up on the link's parent rather than carried in a
   data attribute: both live in the same <li>, and a src attribute would have
   to be escaped into the markup only to be parsed back out of it here.

   Scoped to this file for the same reason main.js is: see the note there.
   ============================================================ */
(function () {

'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const box = $('#certBox');
if (!box) return;

const slot = box.querySelector('[data-cert-slot]');
const cap = box.querySelector('[data-cert-cap]');
const closeBtn = box.querySelector('[data-cert-close]');
let opener = null;

function label(link) {
  const parts = [link.dataset.issuer, link.dataset.name, link.dataset.date];
  const id = link.dataset.certId;
  const text = parts.filter(Boolean).join(' — ');
  return id ? `${text} · certificate ${id}` : text;
}

function open(link) {
  // The link is a child of the row and the template is its next sibling, so
  // one query on the row finds it without a second selector in the markup.
  const tpl = link.parentNode.querySelector('template[data-cert]');
  if (!tpl) return; // nothing to show: let the link navigate

  slot.replaceChildren(tpl.content.cloneNode(true));
  cap.textContent = label(link);
  opener = link;
  box.hidden = false;
  document.body.classList.add('has-overlay');
  closeBtn.focus();

  const img = slot.querySelector('img');
  // The clone carries decoding="async", so the box can paint before the
  // bitmap arrives and show a hole in the middle of the panel otherwise.
  if (img && !img.complete) box.classList.add('is-loading');
}

function close() {
  if (box.hidden) return;
  box.hidden = true;
  box.classList.remove('is-loading');
  document.body.classList.remove('has-overlay');
  slot.replaceChildren();
  cap.textContent = '';
  // Return focus where it came from, so keyboard users are not dropped at
  // the top of the page.
  if (opener) opener.focus();
  opener = null;
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-cert-open]');
  if (!link) return;
  e.preventDefault();
  open(link);
});

// The image is big enough to cover the panel on a narrow screen, so treat a
// click anywhere that is not the panel or the button as a dismiss.
box.addEventListener('click', (e) => {
  if (e.target === box || e.target.closest('[data-cert-close]')) close();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
});

// Tab is kept inside the overlay while it is open.
box.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const focusable = $$('a[href], button:not([disabled])', box);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

})();