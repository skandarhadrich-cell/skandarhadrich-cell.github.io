# 0xmrerror.me — Cybersecurity Portfolio

Personal cybersecurity portfolio and CTF writeups site for **Skandar Hadrich** (`0xmrerror`).

Live at: [https://0xmrerror.me](https://0xmrerror.me)

---

## Stack

Pure static HTML + CSS + vanilla JS. No build step, no dependencies, no backend.
Fonts loaded from Google Fonts (Fira Code). Everything else is self-contained.

```
0xmrerror/
├── index.html          # Main portfolio page
├── 404.html            # Custom 404 page
├── CNAME               # GitHub Pages custom domain record
├── css/
│   └── style.css       # Full design system + responsive styles
├── js/
│   └── main.js         # Nav, scroll reveal, filter, modal, uptime
├── .github/
│   └── workflows/
│       └── deploy.yml  # Auto-deploy to GitHub Pages on push to main
└── README.md
```

---

## DNS Configuration

Point your domain registrar to GitHub Pages using the following records:

### A Records (apex domain)
| Type | Host | Value            |
|------|------|-----------------|
| A    | @    | 185.199.108.153 |
| A    | @    | 185.199.109.153 |
| A    | @    | 185.199.110.153 |
| A    | @    | 185.199.111.153 |

### CNAME Record (www subdomain)
| Type  | Host | Value                        |
|-------|------|------------------------------|
| CNAME | www  | skandarhadrich-cell.github.io |

Allow 5–10 minutes for DNS propagation (up to 48h for full global propagation).

---

## GitHub Pages Setup

1. Push this repo to `skandarhadrich-cell/skandarhadrich-cell.github.io`  
   **or** any repo — then set the Pages source to the `main` branch root.

2. In the repo **Settings → Pages**:
   - Source: `Deploy from a branch` → `main` → `/ (root)`
   - Custom domain: `0xmrerror.me`
   - ✅ Enforce HTTPS (enable after DNS propagates)

3. The `CNAME` file in the repo root handles the custom domain automatically.

4. Optionally use the included GitHub Actions workflow (`.github/workflows/deploy.yml`)
   for automatic redeploy on every push.

---

## Adding Writeups

Writeups live in `js/main.js` in the `WRITEUPS` object. Each entry is keyed by a slug:

```js
const WRITEUPS = {
  'my-writeup-slug': {
    title: 'Machine Name — Technique',
    meta: { diff: 'easy|medium|hard', platform: 'thm|htb|ctf', time: 'N min' },
    content: `
      <h2>Title</h2>
      <p>Intro paragraph...</p>
      <h3>Section</h3>
      <pre><code>your command here</code></pre>
    `
  }
};
```

Then add a matching card in `index.html`:

```html
<div class="writeup-card" data-writeup="my-writeup-slug"
     data-diff="medium" data-platform="htb" role="button" tabindex="0">
  <span class="writeup-idx">06.</span>
  <div class="writeup-info">
    <div class="writeup-title">Machine Name — Technique</div>
    <div class="writeup-meta">
      <span class="diff-badge diff-medium">Medium</span>
      <span class="platform-tag htb">Hack The Box</span>
      <span class="read-time">⏱ 12 min read</span>
    </div>
  </div>
  <span class="writeup-arrow">→</span>
</div>
```

---

## Design System

| Token           | Value                     |
|-----------------|---------------------------|
| Background      | `#0d1117`                 |
| Panel           | `#111820`                 |
| Card            | `#0f1923`                 |
| Accent (green)  | `#00ff66`                 |
| Accent (cyan)   | `#00d4ff`                 |
| Text            | `#c9d1d9`                 |
| Text dim        | `#6e7a8a`                 |
| Font            | Fira Code, monospace      |
| Border radius   | 4px                       |

---

© 2026 Skandar Hadrich · MIT License
