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
├── writeups/
│   ├── template.html   # Copy this to add a new writeup
│   ├── images/         # Screenshots copied here by the script
│   └── *.html          # One content fragment per writeup
├── tools/
│   └── add-writeup.py  # Markdown → fragment + card + push
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

Each writeup is its own content fragment in the `writeups/` folder
(e.g. `writeups/smol.html`). The modal on `index.html` fetches the file
when you click a card — no JS data object to touch.

### Fast path — the script

`tools/add-writeup.py` does the whole flow from your CTF writeup folder:

```sh
python3 tools/add-writeup.py Brute
```

Give it the CTF's folder name and it:

1. **Finds your writeup** inside that folder — it looks in `~/Desktop/ctf-writeups`
   (override with `--base <dir>` or the `CTF_WRITEUPS_DIR` env var), matching the
   folder name (case-insensitive). Asset/screenshot folders are skipped:

   ```
   ~/Desktop/ctf-writeups/
   └── Brute/
       ├── Brute.md              # picked up automatically
       └── assets/               # screenshots — ignored for discovery
   ```

   A direct path to the folder (or to a `.md` file) also works:
   `python3 tools/add-writeup.py ~/Desktop/ctf-writeups/Reverse-challenge/Brute`

2. Converts the Markdown into `writeups/<slug>.html` —
   `#`→`<h2>`, `##`→`<h3>` phases, paragraphs, code blocks, lists,
   blockquotes, links, inline code, `THM{...}`/`HTB{...}` flags, and
   best-effort bash highlighting (comments + known commands + `$` prompts).
3. Copies any **screenshots** referenced in the Markdown
   (`![alt](shot.png)`) into `writeups/images/<slug>/` and fixes the paths.
4. Adds the matching **card** in `index.html` with the next index number,
   difficulty/platform badges, and an auto-estimated read time.
5. **Commits and pushes** to main — GitHub Actions redeploys.

Markdown conventions:

```md
# Title                    →  <h2>  (the modal heading)
## 1 · Reconnaissance      →  <h3>  (numbered phase)
```sh
nmap -sC -sV host
# a comment gets styled
$ whoami
```
![TLS scan](shot.png)     →  local image copied + re-homed
The flag was THM{...}     →  styled flag span
```

Optional front matter at the top is also honored:

```md
---
slug: my-ctf
title: My CTF — Technique to Root
diff: medium
platform: thm
---
```

Options: `--base`, `--markdown`, `--slug`, `--title`, `--diff easy|medium|hard`,
`--platform thm|htb|ctf`, `--time <min>`, `--no-highlight`, `--no-commit`
(write files only), `--no-push` (commit, don't push).

> Skip the commit/push and preview locally:
> `python3 tools/add-writeup.py Brute --no-commit`
> then serve with `python3 -m http.server` and click the new card.

### Manual path

1. **Create the file** — copy the template and fill it in:

   ```sh
   cp writeups/template.html writeups/my-ctf.html
   ```

   The template contains full instructions in its header comment
   (phase structure, syntax tokens, flag format). A fragment is plain HTML —
   no `<html>`, `<head>`, or `<link>`, only the body content, because it is
   rendered inside the terminal modal.

2. **Add a matching card** in `index.html` inside the `#writeups` section:

   ```html
   <div class="writeup-card" data-writeup="my-ctf"
        data-src="writeups/my-ctf.html"
        data-diff="medium" data-platform="thm" role="button" tabindex="0">
     <span class="writeup-idx">09.</span>
     <div class="writeup-info">
       <div class="writeup-title">My CTF — Technique to Root</div>
       <div class="writeup-meta">
         <span class="diff-badge diff-medium">Medium</span>
         <span class="platform-tag thm">TryHackMe</span>
         <span class="read-time">⏱ 15 min read</span>
       </div>
     </div>
     <span class="writeup-arrow">→</span>
   </div>
   ```

   - `data-writeup` && `data-src` must line up (`writeups/<slug>.html`)
   - `writeup-idx` numbers the cards in order (01., 02., …)
   - `data-diff`: `easy` | `medium` | `hard` ↦ badge `diff-easy|medium|hard`
   - `data-platform`: `thm` | `htb` | `ctf` ↦ tag `platform-tag thm|htb|ctf`

3. **Push to main** — GitHub Actions redeploys the site (takes a minute).

> Note: fragments are loaded via `fetch()`, so preview the site locally with
> `python3 -m http.server` (opening `index.html` straight from disk won't work).

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
