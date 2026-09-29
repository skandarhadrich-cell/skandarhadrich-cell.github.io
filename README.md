# 0xmrerror.me

Source for [0xmrerror.me](https://0xmrerror.me) — Skandar Hadrich's portfolio
and CTF write-up archive.

**The published site is the generated HTML in this repository.** There is no
build server, no framework, no bundler, and no client-side rendering step. What
you see on the live domain is the output of `tools/build.py`, committed to
`main` and served by GitHub Pages.

---

## Editing content

Two files hold everything. You should never need to edit a generated `.html`
file — if you find yourself doing that, the content belongs in the data files.

| File | What lives there |
| --- | --- |
| `data/site.json` | Identity, bio, skills, toolbelt, experience, education, projects, certifications, contact details |
| `data/writeups/NN-slug.md` | One write-up: front matter + body |
| `templates/*.html` | Page shells — the HTML structure, not the content |
| `data/site.json` → `nav` | Top navigation and left-rail items |
| `data/site.json` → `pipeline` | The 8 stages of the flagship project |

After editing either data file:

```bash
python3 tools/build.py
```

That regenerates `index.html`, `cv.html`, `writeups/*/index.html`,
`sitemap.xml`, `feed.xml` and `search-index.json`. **Commit the regenerated
HTML along with your data change** — CI fails the deploy if you forget, which
is the point of `build.py --check`.

### Writing a write-up

```bash
python3 tools/add-writeup.py            # interactive
python3 tools/add-writeup.py --list     # what exists, and the next free order
```

Or scaffold one directly:

```bash
python3 tools/add-writeup.py \
  --title "Watcher — LFI to Root in 7 Flags" \
  --type web --diff hard --platform thm \
  --summary "A boot2root with a long linear chain: LFI becomes a webshell, a writable service binary becomes root."
```

The file name prefix (`10-`, `20-`, …) controls the order on the index page.
Leave gaps so you can slot a new write-up into the right place later.

`add-writeup.py` writes one file and runs the build. It does not commit, does
not push, and never touches the network.

### Body format

The body is **Markdown**, and raw HTML blocks pass straight through. If a body
contains an `<h2>`, `<pre>` or `<div>`, the Markdown converter is skipped
entirely — which is how the existing write-ups keep their hand-applied
syntax highlighting.

Supported: `#`–`####` headings, `-`/`*` and `1.` lists, `>` blockquotes,
fenced code blocks with a language tag, `**bold**`, `` `inline code` ``,
`[links](url)`, `![images](src)`, and `$ ` / `# ` prompt lines in shell
fences, which get highlighted and coloured like a real terminal.

Any `THM{…}`, `HTB{…}`, `picoCTF{…}` or `CTF{…}` in the text is turned into a
click-to-reveal spoiler automatically, so flags do not spoil the page for
someone skimming.

### Front matter

```yaml
---
title: "Keygenme — MD5 Hex Spliced Into a License Key"
slug: keygenme              # optional; defaults to the filename
type: re                    # web | re | pwn | forensics | crypto | osint
diff: hard                  # easy | medium | hard
platform: ctf               # thm | htb | ctf
read_time: 18               # optional; estimated from word count if omitted
summary: "One sentence, under 180 characters — this becomes the meta description."
date: 2022-01-01            # optional, YYYY-MM-DD
tags: md5, keygen, gdb      # optional, powers search and the tag chips
---
```

`summary` is what appears on the index card, in search results, in the RSS
feed, and in the `<meta name="description">`. It is the highest-leverage line
in the file.

---

## Running it locally

The generated site uses root-absolute URLs, so it must be served over HTTP.
Opening `index.html` with `file://` will show unstyled HTML — that is expected.

```bash
python3 tools/serve.py             # http://localhost:8000
python3 tools/serve.py --watch     # rebuild when data/ or templates/ change
```

Nothing needs installing. `build.py`, `serve.py` and `add-writeup.py` use only
the Python standard library. The one optional dependency is Pillow, used by
`tools/gen-assets.py` to draw the social card and app icons:

```bash
python3 -m pip install Pillow
python3 tools/gen-assets.py
```

---

## Repository layout

```
data/site.json            everything about the person
data/writeups/*.md        one file per write-up
templates/                page shells consumed by build.py
tools/build.py            the generator  (stdlib only)
tools/add-writeup.py      write-up scaffolder  (stdlib only)
tools/serve.py            local preview server  (stdlib only)
tools/stage.py            copies the deployable tree into _site/  (stdlib only)
tools/gen-assets.py       icons + OG card  (needs Pillow)

css/                      tokens → base → layout → components → writeups → print
fonts/                    self-hosted Inter + Fira Code (latin subset)
js/main.js                theme, nav, rail, filters, command palette
js/writeups.js            TOC, code copy, flag spoilers, reading progress
assets/                   CV, generated icons, cert marks, write-up screenshots

index.html                ← generated
cv.html                   ← generated
404.html                  ← generated
writeups/<slug>/index.html ← generated
sitemap.xml, feed.xml, search-index.json  ← generated
```

Anything listed as generated is overwritten by `tools/build.py`. Edit
`data/` or `templates/` instead.

---

## Design notes

- **Two fonts, two jobs.** Inter for body and UI; Fira Code for code, prompts,
  labels and badges. The previous site rendered everything in a monospace
  face, which is the single biggest reason body copy was hard to read.
- **The accent is a hue, not a colour.** `css/tokens.css` derives every accent
  from `--hue`, so the phosphor / nord / crimson variants and both light and
  dark themes are one-line changes rather than a second palette to maintain.
- **Semantic colours are never used for branding.** Difficulty badges
  (easy/medium/hard) use the green/amber/red semantic ramp; the brand green is
  reserved for the site itself. Conflating the two makes "hard" read as
  "success".
- **No self-assigned percentages.** The old site had 24 skill bars rated
  out of 100. The six skill groups here are evidence-backed: every item maps to
  a project, a certification, or a write-up on this site.
- **Accessibility.** Body text is at or above 4.8:1 against its background in
  both themes; `validate.yml` recomputes those ratios so a palette change
  cannot silently regress them. Focus is always visible, `prefers-reduced-motion`
  is honoured, and the print stylesheet turns the site into a clean A4 CV.
- **No third-party requests.** Fonts are self-hosted, there is no analytics,
  no CDN, and no cookie banner because there are no cookies.

---

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`:

1. `build.py --check` — refuse to deploy if the committed HTML does not match
   what `build.py` produces from `data/`. This is what stops the data and the
   HTML from drifting apart.
2. Rebuild from `data/`, then `tools/stage.py` copies an explicit allow-list of
   files into `_site/`, and that directory alone is uploaded and deployed.

Step 2 is deliberately not `upload-pages-artifact` pointed at the repository
root. The root also holds `data/`, `templates/`, `tools/` and `.git`; publishing
it wholesale would make the full git history readable at `/.git/config`. The
allow-list lives in `tools/stage.py`, so "what gets deployed" is one readable
list rather than whatever happens to be in the working tree. `_site/` is
gitignored and regenerated on every deploy.

`.github/workflows/validate.yml` runs alongside it and checks the build is
reproducible, no template tokens survived, no `meta description` overflows the
snippet budget, the HTML validates, every internal link resolves, every theme ×
accent × page combination meets WCAG AA, nothing overflows horizontally at any
viewport, and the palette tokens still clear AA — bare *and* composited on their
own `-soft` tint, which is the surface a badge is actually painted on.

Custom domain is set through `CNAME`; pages settings must have
**Enforce HTTPS** on and the apex domain pointed at GitHub Pages.

---

## License

MIT — see [LICENSE](LICENSE).

Certification issuer marks in `assets/certs/` are typographic stand-ins
generated by `tools/gen-assets.py`, not the vendors' official logos.
