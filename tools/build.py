#!/usr/bin/env python3
"""0xmrerror.me — static site generator.

Renders the whole site from two sources of truth:

    data/site.json         identity, skills, experience, projects, certs
    data/writeups/*.md     one file per writeup, YAML-ish front matter + body

and the shells in templates/*.html.  Output is plain committed HTML:

    index.html
    cv.html
    404.html
    writeups/<slug>/index.html
    search-index.json
    sitemap.xml
    feed.xml

No third-party dependencies, no build server, no client-side framework.
Run it with no arguments; it rebuilds everything and reports what changed.

    python3 tools/build.py            # rebuild everything
    python3 tools/build.py --check    # fail if output is stale (for CI)
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
TPL = os.path.join(ROOT, "templates")
WUDIR = os.path.join(ROOT, "writeups")

SITE_URL = "https://0xmrerror.me"
DIFFS = {"easy": "Easy", "medium": "Medium", "hard": "Hard"}
TYPES = {
    "web": "Web",
    "re": "Reverse engineering",
    "pwn": "Binary exploitation",
    "forensics": "Forensics",
    "crypto": "Cryptography",
    "osint": "OSINT",
}
PLATFORMS = {"thm": "TryHackMe", "htb": "Hack The Box", "ctf": "CTF"}
PROJECT_STATE = {
    "code": ("view code", "Source on GitHub"),
    "writeup": ("read the write-up", "Repository holds a technical write-up, not source"),
    "lab": (None, "Lab research — nothing published"),
}

GREEN = "\033[32m"
DIM = "\033[2m"
RED = "\033[31m"
YEL = "\033[33m"
OFF = "\033[0m"


# ── small helpers ──────────────────────────────────────────────────────────

def esc(s) -> str:
    return html.escape(str(s), quote=True)


# Bullets are authored content and may carry a small, fixed set of inline
# tags -- the Keystone entry uses <code> around an identifier it is talking
# about. Escape the string as data first, then put back only those tags,
# unadorned. Anything with an attribute, or any tag outside this list, stays
# escaped, so a typo in the JSON can never inject markup.
_INLINE_OK = re.compile(r"&lt;(/?)(code|b|strong|em|i|br)(\s*/?)&gt;", re.I)


def trusted_inline(s) -> str:
    return _INLINE_OK.sub(
        lambda m: f"<{m.group(1)}{m.group(2).lower()}{m.group(3)}>", esc(s)
    )


def read(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def tidy(content: str) -> str:
    """Strip trailing whitespace, but never inside a preformatted block.

    Template indentation around an empty substitution leaves a line of
    nothing but spaces, and indentation left over after a wrapped tag
    leaves a few more after the text. Both are invisible and both are
    what the HTML validator reports. <pre>/<textarea> are skipped
    outright, because there trailing whitespace is content -- it can
    carry indentation in a language where that is significant.
    """
    blank = re.compile(r"(?m)[ \t]+$")
    tag = re.compile(r"<(/?)(pre|textarea)\b[^>]*>", re.I)
    out, pos, literal = [], 0, False
    for m in tag.finditer(content):
        chunk = content[pos:m.start()]
        out.append(chunk if literal else blank.sub("", chunk))
        out.append(m.group(0))
        pos = m.end()
        literal = m.group(1) == ""          # inside a preformatted element?
    tail = content[pos:]
    out.append(tail if literal else blank.sub("", tail))
    return "".join(out)


def write(path: str, content: str) -> bool:
    """Write only when content differs, so mtimes stay stable. Returns changed."""
    if path.endswith((".html", ".xml")):
        content = tidy(content)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            if fh.read() == content:
                return False
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    return True


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "entry"


def render(template: str, tokens: dict) -> str:
    src = read(os.path.join(TPL, template))
    for key, value in tokens.items():
        src = src.replace("{{" + key + "}}", str(value))
    leftover = re.findall(r"\{\{(\w+)\}\}", src)
    if leftover:
        raise SystemExit(
            f"{RED}[!]{OFF} template {template} has unfilled tokens: "
            + ", ".join(sorted(set(leftover)))
        )
    return src


# ── data loading ───────────────────────────────────────────────────────────

def load_site() -> dict:
    with open(os.path.join(DATA, "site.json"), encoding="utf-8") as fh:
        return json.load(fh)


def parse_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end == -1:
        return {}, text
    fm, body = {}, text[4:end].lstrip("\n")
    for line in body.split("\n"):
        if ":" in line and not line.strip().startswith("#"):
            key, val = line.split(":", 1)
            val = val.strip()
            if len(val) > 1 and val[0] == val[-1] and val[0] in "\"'":
                val = val[1:-1]
            fm[key.strip().lower()] = val
    return fm, text[end + 4:].lstrip("\n")


def load_writeups() -> list[dict]:
    """Read data/writeups/*.md. The file name defines the order (prefix with 10-, 20-… to control it)."""
    wdir = os.path.join(DATA, "writeups")
    items = []
    for fn in sorted(os.listdir(wdir)):
        if not fn.endswith(".md"):
            continue
        fm, body = parse_front_matter(read(os.path.join(wdir, fn)))
        slug = fm.get("slug") or os.path.splitext(fn)[0].split("-", 1)[-1]
        order = int(re.match(r"(\d+)", fn).group(1)) if re.match(r"(\d+)", fn) else 999
        title = fm.get("title") or slug.replace("-", " ").title()
        body = strip_redundant_title(body, title)
        words = len(re.sub(r"<[^>]+>", " ", body).split())
        items.append({
            "slug": slug,
            "order": order,
            "title": title,
            "body": body,
            "type": fm.get("type", "web"),
            "diff": fm.get("diff", "medium"),
            "platform": fm.get("platform", "ctf"),
            "read_time": int(fm.get("read_time") or max(3, round(words / 200))),
            "summary": fm.get("summary", ""),
            "date": fm.get("date", ""),
            "tags": [t for t in re.split(r"[,\s]+", fm.get("tags", "")) if t],
            "url": f"/writeups/{slug}/",
        })
    items.sort(key=lambda w: w["order"])
    return items


def strip_redundant_title(body: str, title: str) -> str:
    """A writeup body usually opens with an <h1>/<h2> repeating the card title.
    The page already renders an <h1>, so drop the duplicate."""
    stripped = body.lstrip()
    for level in (1, 2):
        m = re.match(rf"<h{level}[^>]*>\s*(.*?)\s*</h{level}>\s*", stripped, re.S)
        if m and re.sub(r"<[^>]+>", "", m.group(1)).strip().lower() == title.strip().lower():
            return stripped[m.end():]
    m = re.match(r"^#\s+(.*)\n", stripped)
    if m and m.group(1).strip().lower() == title.strip().lower():
        return stripped[m.end():]
    return body


# ── markdown → html (only used for newly authored .md bodies) ─────────────

KNOWN_COMMANDS = set("""amass base64 binwalk cat cd chmod chown curl dirb dirsearch docker
echo enum4linux evil-winrm exiftool fcrackzip ffuf find getconf git gobuster gowitness gpg
grep gzip hashcat hydra id ifconfig ip john jq kubectl ldd less ls man msfconsole mysql nc
netcat nikto nmap openssl php python python3 rdesktop ruby searchsploit smbclient smbmap
sqlmap ssh ssh2john steghide strings sudo su systemctl tar tcpdump unzip vim wfuzz wget
whatweb whoami wireshark wordlists wpscan xxd xfreerdp zip2john 7z""".split())

FLAG_RE = re.compile(r"\b((?:picoCTF|THM|HTB|CTF)\{[^{}]{3,80}\})")

# `THM{...}` in a *starter template* is a placeholder to be replaced, not a
# real flag, and wrapping it would leave a pointless click-to-reveal chip.
PLACEHOLDER_FLAGS = {"THM{...}", "HTB{...}", "CTF{...}", "picoCTF{...}"}


def wrap_flags(html_text: str) -> str:
    """Mark up bare flags in a body so they can be blurred on demand.

    The Markdown path already does this in `inline()`, but the older write-ups
    are hand-written HTML and would otherwise print their flags in the clear,
    spoiling the page for anyone scrolling to see whether a step is there.

    Flags are wrapped inside <pre> as well as in prose: in a terminal-output
    block the chip styling degrades to a plain tinted span and the blur filter
    still applies.  js/writeups.js drives the reveal.
    """
    def repl(m: re.Match) -> str:
        raw = m.group(1)
        if raw in PLACEHOLDER_FLAGS:
            return m.group(0)
        if html_text[max(0, m.start() - 24):m.start()].endswith('class="flag">'):
            return m.group(0)
        return f'<span class="flag">{raw}</span>'

    return FLAG_RE.sub(repl, html_text)


def inline(text: str) -> str:
    out, pos = [], 0
    pattern = re.compile(
        r"!\[([^\]]*)\]\(([^)\s]+)\)"      # image
        r"|\[([^\]]+)\]\(([^)\s]+)\)"      # link
        r"|`([^`]+)`"                      # code
        r"|\*\*([^*]+)\*\*"               # bold
    )
    for m in pattern.finditer(text):
        out.append(text[pos:m.start()])
        if m.group(1) is not None:
            src = m.group(2)
            out.append(f'<figure><img src="{esc(src)}" alt="{esc(m.group(1))}" loading="lazy">'
                       + (f'<figcaption>{esc(m.group(1))}</figcaption>' if m.group(1) else "")
                       + "</figure>")
        elif m.group(3) is not None:
            out.append(f'<a href="{esc(m.group(4))}" rel="noopener">{m.group(3)}</a>')
        elif m.group(5) is not None:
            out.append(f"<code>{m.group(5)}</code>")
        else:
            out.append(f"<strong>{m.group(6)}</strong>")
        pos = m.end()
    out.append(text[pos:])
    result = "".join(out)
    result = FLAG_RE.sub(lambda m: f'<span class="flag">{m.group(1)}</span>', result)
    return result


def highlight_shell(line: str) -> str:
    if line.lstrip().startswith("#") and not line.lstrip().startswith("#!"):
        return f'<span class="tok-comment">{esc(line)}</span>'
    # Split, then escape every piece as it is emitted. The previous version
    # escaped only the tokens it recognised as commands, flags or numbers
    # and joined the rest verbatim, so a bare "&&" or an unquoted path came
    # out as invalid HTML.
    m = re.match(r"^(\s*)(\$|#)\s(.*)$", line)
    lead, sigil, rest = (m.group(1), m.group(2), m.group(3)) if m else ("", "", line)
    out = [lead]
    if sigil:
        out.append(f'<span class="tok-keyword">{sigil}</span> ')
    tokens = re.split(r"(\s+)", rest)
    for i in range(0, len(tokens), 2):
        word = tokens[i]
        gap = tokens[i + 1] if i + 1 < len(tokens) else ""   # whitespace only
        bare = word.lstrip("$#")
        if bare in KNOWN_COMMANDS:
            out.append(f'{word[:len(word) - len(bare)]}'
                       f'<span class="tok-func">{esc(bare)}</span>{gap}')
        elif re.fullmatch(r"-{1,2}[A-Za-z][\w-]*", bare):
            out.append(f'<span class="tok-keyword">{esc(word)}</span>{gap}')
        elif re.fullmatch(r"\d+", bare):
            out.append(f'<span class="tok-num">{esc(word)}</span>{gap}')
        else:
            out.append(esc(word) + gap)
    return "".join(out)


def markdown_to_html(md: str) -> str:
    """Minimal, predictable converter. Raw HTML blocks pass straight through."""
    if re.search(r"<(h2|h3|div|pre|figure)\b", md):
        return md  # already HTML — keep the hand-highlighted version

    out, code_buf, lang = [], [], ""
    lines = md.split("\n")
    i, in_code, para = 0, False, []

    def flush_para():
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para.clear()

    while i < len(lines):
        line = lines[i]

        if line.startswith("```"):
            flush_para()
            if in_code:
                body = "\n".join(code_buf)
                highlighted = "\n".join(highlight_shell(l) for l in code_buf) if lang in ("", "bash", "sh", "shell", "console") else esc(body)
                out.append(f'<pre><code class="language-{esc(lang or "text")}">{highlighted}</code></pre>')
                code_buf, in_code, lang = [], False, ""
            else:
                in_code, lang = True, line[3:].strip()
            i += 1
            continue

        if in_code:
            code_buf.append(line)
            i += 1
            continue

        if not line.strip():
            flush_para()
            i += 1
            continue

        m = re.match(r"^(#{2,4})\s+(.*)", line)
        if m:
            flush_para()
            level = len(m.group(1))
            out.append(f"<h{level}>{inline(m.group(2).strip())}</h{level}>")
            i += 1
            continue

        m = re.match(r"^[-*]\s+(.*)", line)
        if m:
            flush_para()
            items = []
            while i < len(lines) and (mm := re.match(r"^[-*]\s+(.*)", lines[i])):
                items.append(f"<li>{inline(mm.group(1).strip())}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue

        m = re.match(r"^\d+[.)]\s+(.*)", line)
        if m:
            flush_para()
            items = []
            while i < len(lines) and (mm := re.match(r"^\d+[.)]\s+(.*)", lines[i])):
                items.append(f"<li>{inline(mm.group(1).strip())}</li>")
                i += 1
            out.append("<ol>" + "".join(items) + "</ol>")
            continue

        m = re.match(r"^>\s?(.*)", line)
        if m:
            flush_para()
            out.append(f"<blockquote>{inline(m.group(1))}</blockquote>")
            i += 1
            continue

        if re.match(r"^<(h2|h3|div|pre|figure|p|ul|ol)\b", line.strip()):
            flush_para()
            block = [line]
            i += 1
            while i < len(lines) and lines[i].strip():
                block.append(lines[i])
                i += 1
            out.append("\n".join(block))
            continue

        para.append(line.strip())
        i += 1

    flush_para()
    if in_code and code_buf:
        out.append("<pre><code>" + esc("\n".join(code_buf)) + "</code></pre>")
    return "\n".join(out)


# ── shared layout ──────────────────────────────────────────────────────────

THEME_BOOT = """<script>
(function(){var d=document.documentElement;d.classList.add('js');
try{var t=localStorage.getItem('0xmrerror:theme')||'dark';
if(t==='auto'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}
d.dataset.theme=t;var a=localStorage.getItem('0xmrerror:accent');if(a){d.dataset.accent=a;}}catch(e){}})();
</script>"""

CANONICAL_ABSPATH = re.compile(r'(href|src)="/')


def head(site: dict, *, title: str, desc: str, url: str,
         og_type: str = "website", with_writeup_css: bool = False,
         extra: str = "") -> str:
    ident, s = site["identity"], site["site"]
    og_image = f"{SITE_URL}/assets/og.png"
    return f"""  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}">
  <link rel="canonical" href="{esc(url)}">
  <meta name="author" content="{esc(s['name'])}">
  <meta name="theme-color" content="#080b10">

  <meta property="og:type" content="{esc(og_type)}">
  <meta property="og:site_name" content="{esc(s['handle'])}.me">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:url" content="{esc(url)}">
  <meta property="og:image" content="{esc(og_image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="en">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(desc)}">
  <meta name="twitter:image" content="{esc(og_image)}">

  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">

  <link rel="preload" href="/fonts/inter-400-700.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/fira-code-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/fonts/fonts.css">
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/layout.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/writeups.css" media="all">
  <link rel="stylesheet" href="/css/print.css" media="print">
  {THEME_BOOT}
  {extra}"""


def rail(site: dict, writeups: list[dict]) -> str:
    ident, s = site["identity"], site["site"]
    items = "".join(
        f'<li><a class="rail-link" data-nav-link href="/#{esc(n["id"])}">{esc(n["label"])}</a></li>'
        for n in site["nav"]
    )
    palette_items = "".join(
        f'<li class="palette-item" data-palette-item="{esc(n["label"])}" data-palette-hint="section" '
        f'data-palette-kind="section" href="/#{esc(n["id"])}"></li>'
        for n in site["nav"]
    )
    palette_items += "".join(
        f'<li class="palette-item" data-palette-item="{esc(w["title"])}" data-palette-hint="writeup" '
        f'data-palette-kind="writeup" data-palette-url="{esc(w["url"])}"></li>'
        for w in writeups
    )
    return f"""<aside class="rail" aria-label="Section navigation">
  <div class="rail-logo">{esc(s['handle'])}<small>@{esc(s['name'].split()[-1].lower())}</small></div>
  <ul class="rail-nav" data-rail-nav>
    {items}
  </ul>
  <div class="rail-progress" aria-hidden="true"><i></i></div>
  <div class="rail-meta">
    {esc(ident['location'])}<br>
    <span class="accent">available</span> — Feb 2027<br>
    <a href="{esc(ident['links']['github'])}" rel="noopener">github</a> ·
    <a href="{esc(ident['links']['linkedin'])}" rel="noopener">linkedin</a><br>
    <button class="btn btn--sm btn--ghost btn--micro" type="button" data-accent-toggle
      >accent</button>
    <button class="btn btn--sm btn--ghost btn--micro" type="button" data-theme-toggle
      data-theme-pref="dark" aria-label="Theme: dark">theme</button>
  </div>
</aside>
<!-- palette entries (hidden, read by js/main.js) -->
<ul class="sr-only" aria-hidden="true">{palette_items}</ul>"""


def navbar(site: dict) -> str:
    s = site["site"]
    links = "".join(
        f'<li><a data-nav-link href="/#{esc(n["id"])}">{esc(n["label"])}</a></li>'
        for n in site["nav"]
    )
    return f"""<nav id="nav" aria-label="Primary">
  <div class="nav-inner">
    <a class="nav-logo" href="/">{esc(s['handle'])}<span>@terminal</span></a>
    <ul class="nav-links" id="navLinks">
      {links}
    </ul>
    <div class="nav-actions">
      <a class="btn btn--sm nav-cv" href="/cv.html">cv</a>
      <button class="btn btn--icon btn--ghost" type="button" data-theme-toggle
        data-theme-pref="dark" aria-label="Theme: dark" title="Toggle theme">
        <span aria-hidden="true">◐</span>
      </button>
      <button class="nav-toggle" id="navToggle" type="button"
        aria-label="Toggle menu" aria-expanded="false" aria-controls="navLinks">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</nav>"""


def footer(site: dict) -> str:
    ident, s = site["identity"], site["site"]
    year = dt.date.today().year
    return f"""<footer class="site-footer">
  <div class="container">
    <div class="footer-inner">
      <div class="footer-prompt">
        <b>{esc(s['handle'])}</b>@terminal:~$ <span aria-hidden="true">█</span>
        <p class="footer-note">{esc(site['footer']['note'])}</p>
      </div>
      <div class="footer-cols">
        <div class="footer-col">
          <h4>site</h4>
          <ul>
            <li><a href="/">home</a></li>
            <li><a href="/#writeups">writeups</a></li>
            <li><a href="/cv.html">cv</a></li>
            <li><a href="/feed.xml">rss</a></li>
            <li><a href="/sitemap.xml">sitemap</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>elsewhere</h4>
          <ul>
            <li><a href="{esc(ident['links']['github'])}" rel="noopener">github</a></li>
            <li><a href="{esc(ident['links']['linkedin'])}" rel="noopener">linkedin</a></li>
            <li><a href="{esc(ident['links']['email'])}">email</a></li>
          </ul>
        </div>
      </div>
    </div>
    <div class="footer-base">
      <span>© {year} {esc(s['name'])} · MIT licensed</span>
      <span>since <span data-since="{esc(site['footer']['started'])}" data-since-prefix="">—</span> on GitHub</span>
    </div>
  </div>
</footer>"""


def palette() -> str:
    return """<div class="palette" id="palette" role="dialog" aria-modal="true" aria-label="Command palette">
  <div class="palette-box">
    <input class="palette-input" id="paletteInput" type="text" placeholder="jump to a section or search writeups…"
      autocomplete="off" spellcheck="false" aria-label="Search sections and writeups">
    <!-- [html-validate-disable-next prefer-native-element -- a command palette needs grouped results, an active option and arrow-key navigation; <select> can do none of those] -->
    <ul class="palette-list" id="paletteList" role="listbox" aria-label="Results"></ul>
    <div class="palette-foot">
      <span><b>↑↓</b> navigate</span><span><b>↵</b> open</span><span><b>esc</b> close</span>
    </div>
  </div>
</div>"""


def scripts() -> str:
    return '<script src="/js/main.js" defer></script>\n<script src="/js/writeups.js" defer></script>'


# ── index page blocks ──────────────────────────────────────────────────────

def block_hero(site: dict, writeups: list[dict]) -> str:
    ident, s = site["identity"], site["site"]
    ctf = site["facts"]["ctf"][0]
    ctf_line = re.sub(r"\*\*(.+?)\*\*", r"\1", ctf).replace("HTB University CTF 2025 — ENIT team ranked", "HTB Uni CTF 2025 →")
    return render("_hero.html", {
        "FLAG": ident.get("flag", ""),
        "LOCATION": esc(ident["location"]),
        "ROLE": esc(ident["role"]),
        "ORG": esc(ident["org"]),
        "HEADLINE_HTML": re.sub(r"\*(.+?)\*", r"<em>\1</em>", ident["headline"]),
        "SUBLINE": esc(ident["subline"]),
        "AVAILABILITY": esc(ident["availability"]["text"]),
        "CTF_LINE": esc(ctf_line),
        "EMAIL": esc(ident["email"]),
        "GITHUB": esc(ident["github"]),
        "GITHUB_URL": esc(ident["links"]["github"]),
    })


def block_stats(site: dict) -> str:
    return "\n".join(
        f'      <div class="stat"><b>{esc(s["value"])}</b><span>{esc(s["label"])}</span></div>'
        for s in site["stats"]
    )


def block_whoami(site: dict) -> str:
    a = site["about"]

    def field(f: dict) -> str:
        # `wide` fields take a whole grid row. The focus line is long, and
        # sharing a row with the affiliation left it cramped and wrapped.
        cls = "about-field about-field--wide" if f.get("wide") else "about-field"
        val = (f'<a href="{esc(f["link"])}" rel="noopener">{esc(f["val"])}</a>'
               if f.get("link") else esc(f["val"]))
        return f'<div class="{cls}"><dt>{esc(f["key"])}</dt><dd>{val}</dd></div>'

    fields = "".join(field(f) for f in a["fields"])
    badges = "".join(
        f'<div class="rank-badge"><span aria-hidden="true">{esc(b["icon"])}</span>'
        f'<span>{esc(b["text"])}</span><b>{esc(b["strong"])}</b><small>{esc(b["sub"])}</small></div>'
        for b in a["badges"]
    )
    return render("_whoami.html", {
        "HANDLE": esc(site["site"]["handle"]),
        "SUBLINE_SHORT": esc(re.sub(r"\*\*(.+?)\*\*", r"\1", site["facts"]["ctf"][0])),
        "ABOUT_FIELDS": fields,
        "BIO": esc(a["bio"]),
        "ABOUT_BADGES": badges,
    })


def block_arsenal(site: dict) -> str:
    skills = "\n".join(
        f'      <article class="card skill-group reveal">\n'
        f'        <div class="skill-group-head"><span class="ico" aria-hidden="true">{esc(g["icon"])}</span>'
        f'<h3>{esc(g["name"])}</h3></div>\n'
        f'        <ul class="skill-list">'
        + "".join(f'<li><span class="tag">{esc(i)}</span></li>' for i in g["items"])
        + "</ul>\n      </article>"
        for g in site["skills"]
    )
    toolbelt = "\n".join(
        f'      <div class="toolbelt-row">\n        <h4>{esc(label)}</h4>\n        '
        + "".join(f'<span class="tag">{esc(t)}</span>' for t in tools)
        + "\n      </div>"
        for label, tools in site["toolbelt"].items()
    )
    return render("_arsenal.html", {
        "HANDLE": esc(site["site"]["handle"]),
        "SKILL_COUNT": len(site["skills"]),
        "SKILLS": skills,
        "TOOLBELT": toolbelt,
    })



def block_experience(site: dict) -> str:
    exp = "".join(
        f'          <div class="tl-item">\n'
        f'            <div class="tl-top"><span class="tl-org">{esc(j["org"])}</span>'
        f'<span class="tl-when">{esc(j["period"])} · {esc(j["place"])}</span></div>\n'
        f'            <div class="tl-role">{esc(j["role"])}</div>\n'
        f'            <ul>' + "".join(f"<li>{trusted_inline(b)}</li>" for b in j["bullets"]) + "</ul>\n"
        f'          </div>\n'
        for j in site["experience"]
    )
    edu = "".join(
        f'          <div class="edu-item">\n            <b>{esc(e["org"])}</b>\n'
        f'            <span class="deg">{esc(e["degree"])}</span>\n'
        f'            <span class="tl-when">{esc(e["period"])}</span>\n'
        f'            <span class="note">{esc(e["note"])}</span>\n'
        f'          </div>\n'
        for e in site["education"]
    )
    facts = site["facts"]
    # A tag longer than ~40 characters is a sentence, not a label: let it wrap
    # instead of forcing a nowrap chip that overflows narrow viewports.
    def fact_tag(x: str) -> str:
        cls = "tag tag--long" if len(x) > 40 else "tag"
        return f'<span class="{cls}">{esc(x)}</span>'

    facts_html = "".join(
        f'<p class="dim fact-line">'
        + "".join(fact_tag(x) for x in facts[key])
        + "</p>"
        for key in ("ctf", "clubs", "languages")
    )
    return render("_experience.html", {
        "HANDLE": esc(site["site"]["handle"]),
        "EXP_COUNT": len(site["experience"]),
        "EXPERIENCE": exp,
        "EDUCATION": edu,
        "FACTS": facts_html,
    })


def block_work(site: dict) -> str:
    cards = []
    for p in site["projects"]:
        cls = "card project-card project-card--featured reveal span-all" if p.get("featured") else "card project-card reveal"
        flag = f'<span class="project-flag">{esc(p["badge"])}</span>' if p.get("badge") else ""
        metrics = "".join(f'<span>{esc(m)}</span>' for m in p.get("metrics", []))
        stack = "".join(f'<span class="tag">{esc(t)}</span>' for t in p.get("stack", []))
        if p.get("repo"):
            label, title_attr = PROJECT_STATE.get(p.get("state", "code"), ("view code", "Source on GitHub"))
            cta = (f'<a class="btn btn--sm" href="{esc(p["repo"])}" rel="noopener" title="{esc(title_attr)}">'
                   f'{esc(label)} <span aria-hidden="true">↗</span></a>')
        else:
            cta = ""
        state_note = {
            "code": "source published",
            "writeup": "write-up only — no source in the repo",
            "lab": "lab work — nothing published",
        }[p.get("state", "code")]
        cards.append(f"""      <article class="{cls}">
        <div class="project-head"><h3>{esc(p['name'])}</h3>{flag}</div>
        <p>{esc(p['desc'])}</p>
        <div class="project-metrics">{metrics}</div>
        <div class="skill-list">{stack}</div>
        <div class="project-foot">{cta}<span class="project-state">{esc(state_note)}</span></div>
      </article>""")
    stages = "".join(
        f'      <div class="stage">\n        <span class="n">STAGE {s["n"]:02d}</span>\n'
        f'        <b>{esc(s["name"])}</b>\n        <span class="tool">{esc(s["tool"])}</span>\n'
        f'        <small>{esc(s["note"])}</small>\n      </div>'
        for s in site["pipeline"]["stages"]
    )
    return render("_work.html", {
        "HANDLE": esc(site["site"]["handle"]),
        "PROJ_COUNT": len(site["projects"]),
        "PROJECTS": "\n".join(cards),
        "PIPELINE": stages,
    })


def block_writeups(site: dict, writeups: list[dict]) -> str:
    cards = []
    for i, w in enumerate(writeups, 1):
        cards.append(f"""      <a class="writeup-card" href="{esc(w['url'])}" data-writeup-card
         data-type="{esc(w['type'])}" data-diff="{esc(w['diff'])}" data-platform="{esc(w['platform'])}">
        <span class="writeup-idx">{i:02d}.</span>
        <span class="writeup-body">
          <span class="writeup-title">{esc(w['title'])}</span>
          <span class="writeup-sum">{esc(w['summary'])}</span>
          <span class="writeup-meta">
            <span class="badge-diff" data-diff="{esc(w['diff'])}">{esc(DIFFS.get(w['diff'], w['diff']))}</span>
            <span class="badge-platform" data-platform="{esc(w['platform'])}">{esc(PLATFORMS.get(w['platform'], w['platform']))}</span>
            <span class="writeup-time">{esc(TYPES.get(w['type'], w['type']))} · {esc(w['read_time'])} min</span>
          </span>
        </span>
        <span class="writeup-arrow" aria-hidden="true">→</span>
      </a>""")
    return render("_writeups.html", {
        "HANDLE": esc(site["site"]["handle"]),
        "WU_COUNT": len(writeups),
        "WRITEUPS": "\n".join(cards),
    })


def block_certs(site: dict) -> str:
    published = [c for c in site["certs"] if c.get("published", True)]
    cards = "".join(
        f'      <article class="card cert-card reveal">\n'
        f'        <div class="cert-issuer">'
        f'<img src="/assets/certs/{esc(c["issuer_slug"])}.png" alt="" width="20" height="20" loading="lazy">'
        f'<span>{esc(c["issuer"])}</span></div>\n'
        f'        <h3>{esc(c["name"])}</h3>\n'
        f'        <div class="cert-skills">{esc(c.get("skills", ""))}</div>\n'
        f'        <div class="cert-foot">\n'
        f'          <span class="cert-date">{esc(c["date"])}</span>\n'
        f'          <span class="cert-verify"><span aria-hidden="true">\u2713</span> verified</span>\n'
        f'        </div>\n'
        + (f'        <div class="cert-id">{esc(c["id"])}</div>\n' if c.get("id") else "")
        + '      </article>\n'
        for c in published
    )
    return render("_certs.html", {
        "HANDLE": esc(site["site"]["handle"]),
        "CERT_COUNT": len(site["certs"]),
        "CERTS": cards,
    })


def block_contact(site: dict) -> str:
    ident = site["identity"]
    fields = "".join(
        f'          <div class="about-field"><dt>{esc(k)}</dt><dd>{v}</dd></div>\n'
        for k, v in (
            ("email", f'<button class="btn btn--sm btn--ghost" type="button" data-copy-mail="{esc(ident["email"])}">copy</button>'),
            # non-breaking spaces so the number cannot wrap mid-group
            ("phone", f'<a href="tel:{esc(ident["phone"].replace(" ", ""))}">'
                      f'{esc(ident["phone"]).replace(" ", "&nbsp;")}</a>'),
            ("github", f'<a href="{esc(ident["links"]["github"])}" rel="noopener">{esc(ident["github"])}</a>'),
            ("linkedin", f'<a href="{esc(ident["links"]["linkedin"])}" rel="noopener">{esc(ident["linkedin"])}</a>'),
        )
    )
    elsewhere = "\n".join(
        f'        <p class="dim elsewhere-line">'
        f'<span class="faint elsewhere-key">{esc(k).ljust(9)}</span> {v}</p>'
        for k, v in (
            ("writeups", '<a href="/#writeups">all writeups \u2192</a>'),
            ("cv", '<a href="/cv.html">CV \u2192</a> (also as <a href="/assets/CV_Eng.pdf" rel="noopener">PDF</a>)'),
            ("github", f'<a href="{esc(ident["links"]["github"])}" rel="noopener">{esc(ident["github"])}</a>'),
            ("linkedin", f'<a href="{esc(ident["links"]["linkedin"])}" rel="noopener">{esc(ident["linkedin"])}</a>'),
            ("privacy", "no trackers, no cookies, no third-party requests on this site"),
        )
    )
    return render("_contact.html", {
        "HANDLE": esc(site["site"]["handle"]),
        "AVAILABILITY": esc(ident["availability"]["text"]),
        "EMAIL": esc(ident["email"]),
        "GITHUB_URL": esc(ident["links"]["github"]),
        "LINKEDIN_URL": esc(ident["links"]["linkedin"]),
        "CONTACT_FIELDS": fields,
        "CONTACT_ELSEWHERE": elsewhere,
        "FOOTER_NOTE": esc(site["footer"]["note"]),
    })



def build_index(site: dict, writeups: list[dict]) -> bool:
    s, ident = site["site"], site["identity"]
    jsonld = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": s["name"],
        "alternateName": s["handle"],
        "url": SITE_URL,
        "email": "mailto:" + ident["email"],
        "jobTitle": "Security Engineer \u2014 Malware Analysis & Reverse Engineering",
        "address": {"@type": "PostalAddress", "addressLocality": "Tunis", "addressCountry": "TN"},
        "alumniOf": {"@type": "CollegeOrUniversity", "name": "ENIT \u2014 National School of Engineers of Tunis"},
        "knowsAbout": [i for g in site["skills"] for i in g["items"]],
        "sameAs": [ident["links"]["github"], ident["links"]["linkedin"]],
    }
    extra = ("  <script type=\"application/ld+json\">"
             + json.dumps(jsonld, indent=2).replace("\n", "\n  ")
             + "</script>")
    page = render("index.html", {
        "SITE_LANG": s["lang"],
        "HEAD": head(site, title=s["title"], desc=s["description"], url=SITE_URL, extra=extra),
        "RAIL": rail(site, writeups),
        "NAVBAR": navbar(site),
        "HERO": block_hero(site, writeups),
        "STATS": block_stats(site),
        "WHOAMI": block_whoami(site),
        "ARSENAL": block_arsenal(site),
        "EXPERIENCE": block_experience(site),
        "PROJECTS": block_work(site),
        "WRITEUPS": block_writeups(site, writeups),
        "CERTS": block_certs(site),
        "CONTACT": block_contact(site),
        "FOOTER": footer(site),
        "PALETTE": palette(),
        "SCRIPTS": scripts(),
    })
    return write(os.path.join(ROOT, "index.html"), page)



# ── writeup pages ──────────────────────────────────────────────────────────

def series_for(w: dict, writeups: list[dict]) -> str:
    peers = [x for x in writeups if x["type"] == w["type"]]
    if len(peers) < 2:
        return ""
    items = "".join(
        f'<a href="{esc(p["url"])}"{" class=\"is-current\"" if p["slug"] == w["slug"] else ""}>'
        f'{esc(p["title"].split(" — ")[0])}</a>'
        for p in peers
    )
    return f'<div class="series"><span>more {esc(TYPES.get(w["type"], w["type"]).lower())}</span>{items}</div>'


def build_writeup(site: dict, w: dict, writeups: list[dict], index: int) -> bool:
    s = site["site"]
    url = SITE_URL + w["url"]
    # the write-up title *is* the page title; appending "— writeup ·
    # 0xmrerror" pushed it to 82 characters, well past what a search
    # result will render
    title = w["title"]
    desc = w["summary"][:180] or w["title"]
    ld = {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        "headline": w["title"],
        "description": desc,
        "url": url,
        "author": {"@type": "Person", "name": s["name"], "url": SITE_URL},
        "keywords": ", ".join([TYPES.get(w["type"], w["type"]), DIFFS.get(w["diff"], ""), w["platform"]])
                   + (", " + ", ".join(w["tags"]) if w["tags"] else ""),
        "proficiencyLevel": w["diff"],
    }
    extra = '  <script type="application/ld+json">' + json.dumps(ld, indent=2).replace("\n", "\n  ") + "</script>"

    prev_w = writeups[index - 1] if index > 0 else None
    next_w = writeups[index + 1] if index < len(writeups) - 1 else None
    prev_html = (f'<a class="prev" href="{esc(prev_w["url"])}"><small>← previous</small>'
                 f'<span>{esc(prev_w["title"])}</span></a>') if prev_w else ""
    next_html = (f'<a class="next" href="{esc(next_w["url"])}"><small>next →</small>'
                 f'<span>{esc(next_w["title"])}</span></a>') if next_w else ""

    meta = (
        f'<span class="badge-diff" data-diff="{esc(w["diff"])}">{esc(DIFFS.get(w["diff"], w["diff"]))}</span>'
        f'<span class="badge-platform" data-platform="{esc(w["platform"])}">{esc(PLATFORMS.get(w["platform"], w["platform"]))}</span>'
        f'<span class="writeup-time">{esc(TYPES.get(w["type"], w["type"]))} · {esc(w["read_time"])} min read</span>'
        + "".join(f'<a class="tag" href="/?type={esc(w["type"])}#writeups">{esc(t)}</a>' for t in w["tags"])
    )

    body = wrap_flags(markdown_to_html(w["body"]))
    page = render("writeup.html", {
        "SITE_LANG": s["lang"],
        "HEAD": head(site, title=title, desc=desc, url=url, og_type="article", extra=extra),
        "RAIL": rail(site, writeups),
        "NAVBAR": navbar(site),
        "BACK_URL": "/",
        "HANDLE": esc(s["handle"]),
        "WU_TITLE": esc(w["title"]),
        "WU_SUMMARY": esc(w["summary"]),
        "WU_META": meta,
        "WU_SERIES": series_for(w, writeups),
        "WU_BODY": body,
        "WU_PREV": prev_html,
        "WU_NEXT": next_html,
        "FOOTER": footer(site),
        "PALETTE": palette(),
        "SCRIPTS": scripts(),
    })
    return write(os.path.join(ROOT, "writeups", w["slug"], "index.html"), page)


# ── cv page ────────────────────────────────────────────────────────────────

def build_cv(site: dict) -> bool:
    ident = site["identity"]
    summary = (
        "ICT Engineering student at ENIT specialising in cybersecurity and systems software, "
        "ranked in the top 1% on TryHackMe globally. Hands-on expertise in malware analysis, "
        "reverse engineering (Ghidra, GDB, Frida, JADX), LLM fine-tuning, penetration testing and "
        "security automation. Architected an end-to-end 8-stage nested-VM malware analysis pipeline "
        "as a sole-contributor research intern at Keystone Group. Active CTF competitor — the ENIT "
        "team placed 77th globally at HTB University CTF 2025."
    )
    expertise = [i for g in site["skills"] for i in g["items"]][:14]

    def h3(t):
        return f'<h3 class="cv-h3">{t}</h3>'

    parts = [
        f'<p class="dim">{esc(summary)}</p>',
        h3("areas of expertise"),
        f'<p class="dim">{esc(" · ".join(expertise))}</p>',
        h3("education"),
    ]
    for e in site["education"]:
        parts.append(
            '<div class="edu-item edu-item--flat">'
            f'<b>{esc(e["org"])}</b><span class="deg">{esc(e["degree"])}</span>'
            f'<span class="tl-when">{esc(e["period"])}</span><span class="note">{esc(e["note"])}</span></div>'
        )
    parts.append(h3("professional experience"))
    for j in site["experience"]:
        parts.append(
            '<div class="tl-item tl-item--flat">'
            f'<div class="tl-top"><span class="tl-org">{esc(j["org"])}</span>'
            f'<span class="tl-when">{esc(j["period"])} · {esc(j["place"])}</span></div>'
            f'<div class="tl-role">{esc(j["role"])}</div>'
            f'<ul>' + "".join(f"<li>{trusted_inline(b)}</li>" for b in j["bullets"]) + "</ul></div>"
        )
    parts.append(h3("projects"))
    for p in site["projects"][:4]:
        parts.append(
            f'<div class="cv-entry"><b class="hi">{esc(p["name"])}</b>'
            f' <span class="faint cv-stack">· {esc(", ".join(p.get("stack", [])[:4]))}</span>'
            f'<p class="dim cv-desc">{esc(p["desc"])}</p></div>'
        )
    parts.append(h3("certifications"))
    parts.append('<ul class="dim cv-list">' + "".join(
        f'<li>{esc(c["name"])} — {esc(c["issuer"])} ({esc(c["date"])})</li>'
        for c in site["certs"] if c.get("published", True)) + "</ul>")
    parts.append(h3("ctf, clubs &amp; languages"))
    facts = site["facts"]
    parts.append(
        f'<p class="dim cv-desc">'
        f'<b class="hi">CTF</b> — {esc(" · ".join(re.sub(r"\\*\\*(.+?)\\*\\*", r"\\1", c) for c in facts["ctf"]))}<br>'
        f'<b class="hi">Clubs</b> — {esc(" · ".join(facts["clubs"]))}<br>'
        f'<b class="hi">Languages</b> — {esc(" · ".join(facts["languages"]))}</p>'
    )

    body = "\n".join(parts)
    page = render("cv.html", {
        "SITE_LANG": site["site"]["lang"],
        "HEAD": head(site,
                     title=f'{site["site"]["name"]} — CV',
                     desc="CV for Skandar Hadrich: reverse engineering, malware analysis, SOC automation, security engineering internship experience.",
                     url=SITE_URL + "/cv.html"),
        "RAIL": "", "NAVBAR": navbar(site),
        "HANDLE": esc(site["site"]["handle"]),
        "NAME": esc(site["site"]["name"]),
        "AVAILABILITY": esc(ident["availability"]["text"]),
        "CV_BODY": body,
        "PDF_URL": "/assets/CV_Eng.pdf",
        "BACK_URL": "/",
        "FOOTER": "", "PALETTE": "", "SCRIPTS": scripts(),
    })
    return write(os.path.join(ROOT, "cv.html"), page)


def build_404(site: dict) -> bool:
    # The 404 is a standalone page, so it carries its own head rather than
    # sharing the site's: no JSON-LD, no palette, no nav, and a noindex.
    # Every asset reference inside it is root-absolute, because a 404 can be
    # served from any path depth and a relative href would break with it.
    page = read(os.path.join(TPL, "404.html"))
    page = page.replace("{{HANDLE}}", esc(site["site"]["handle"]))
    return write(os.path.join(ROOT, "404.html"), page)


# ── feeds, sitemap, search index ───────────────────────────────────────────

def source_date() -> str:
    """Newest commit that touched the content sources, as YYYY-MM-DD.

    Using the wall clock here would make `build.py --check` fail every time
    the site is rebuilt, and using file mtimes would make it fail after a
    fresh checkout.  Git is the only source of truth that is stable in both
    places.  Falls back to an empty string (no <lastmod>) outside a repo.
    """
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", "data", "templates"],
            cwd=ROOT, capture_output=True, text=True, timeout=10, check=True,
        ).stdout.strip()
        return out if re.fullmatch(r"\d{4}-\d{2}-\d{2}", out) else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def build_sitemap(site: dict, writeups: list[dict]) -> bool:
    lastmod = source_date()
    lm = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
    rows = [
        f'  <url><loc>{SITE_URL}/</loc>{lm}'
        f'<changefreq>monthly</changefreq><priority>1.0</priority></url>',
        f'  <url><loc>{SITE_URL}/cv.html</loc>{lm}'
        f'<changefreq>yearly</changefreq><priority>0.6</priority></url>',
    ]
    for w in writeups:
        wlm = f"<lastmod>{esc(w['date'])}</lastmod>" if w.get("date") else lm
        rows.append(f'  <url><loc>{esc(SITE_URL + w["url"])}</loc>{wlm}'
                    f'<changefreq>yearly</changefreq><priority>0.8</priority></url>')
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + "\n".join(rows) + "\n</urlset>\n")
    return write(os.path.join(ROOT, "sitemap.xml"), xml)


def strip_html(s: str) -> str:
    s = re.sub(r"<(script|style)\b.*?</\1>", " ", s, flags=re.S | re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def build_feed(site: dict, writeups: list[dict]) -> bool:
    ident = site["identity"]
    items = []
    for w in writeups:
        items.append(f"""    <item>
      <title>{esc(w['title'])}</title>
      <link>{esc(SITE_URL + w['url'])}</link>
      <guid isPermaLink="true">{esc(SITE_URL + w['url'])}</guid>
      <description>{esc(w['summary'])}</description>
      <category>{esc(TYPES.get(w['type'], w['type']))}</category>{rss_date(w)}
    </item>""")
    # Deliberately no <lastBuildDate>: it would change on every build and
    # make `build.py --check` fail forever. Rebuild times live in git.
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{esc(site['site']['handle'])} — writeups</title>
    <link>{SITE_URL}/</link>
    <description>{esc(site['site']['description'])}</description>
    <language>en</language>
    <atom:link href="{SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
{chr(10).join(items)}
  </channel>
</rss>
"""
    return write(os.path.join(ROOT, "feed.xml"), xml)


def rss_date(w: dict) -> str:
    """RFC 822 date, from the optional `date:` front-matter field."""
    if not w.get("date"):
        return ""
    try:
        d = dt.date.fromisoformat(w["date"])
    except ValueError:
        return ""
    return f"\n      <pubDate>{d.strftime('%a, %d %b %Y 00:00:00 +0000')}</pubDate>"


def build_search_index(writeups: list[dict]) -> bool:
    rows = [{
        "t": w["title"],
        "u": w["url"],
        "d": w["summary"],
        "g": w["tags"] + [TYPES.get(w["type"], w["type"]), w["platform"], w["diff"]],
        "b": strip_html(w["body"])[:600],
    } for w in writeups]
    payload = json.dumps({"writeups": rows}, ensure_ascii=False, separators=(",", ":"))
    return write(os.path.join(ROOT, "search-index.json"), payload + "\n")


# ── main ───────────────────────────────────────────────────────────────────

def prune(writeups: list[dict]) -> int:
    """Delete anything under writeups/ that this build did not produce.

    writeups/ is a build artefact, not a source: every file inside it is
    regenerated from data/writeups/*.md.  Anything left over — a renamed
    slug, or one of the old hand-maintained *.html fragments — is removed so
    the folder always matches the data exactly.
    """
    keep = {w["slug"] for w in writeups}
    removed = 0
    if not os.path.isdir(WUDIR):
        return 0
    for name in sorted(os.listdir(WUDIR)):
        path = os.path.join(WUDIR, name)
        if os.path.isdir(path):
            if name in keep:
                continue
            # only ever remove something that looks generated
            if os.path.isfile(os.path.join(path, "index.html")):
                shutil.rmtree(path)
                removed += 1
        elif name != ".gitkeep" and not name.startswith("."):
            os.remove(path)
            removed += 1
    return removed


def main() -> int:
    ap = argparse.ArgumentParser(description="Render 0xmrerror.me from data/ + templates/")
    ap.add_argument("--check", action="store_true",
                    help="exit non-zero if any generated file is out of date")
    args = ap.parse_args()

    site = load_site()
    writeups = load_writeups()

    if args.check:
        tmp = os.path.join(ROOT, ".build-check")
        os.makedirs(tmp, exist_ok=True)
        before = {}
        for fn in ("index.html", "cv.html", "404.html", "sitemap.xml", "feed.xml", "search-index.json"):
            p = os.path.join(ROOT, fn)
            before[fn] = read(p) if os.path.exists(p) else None
        stale = []
        changed = 0
        changed += build_index(site, writeups)
        changed += build_cv(site)
        changed += build_404(site)
        changed += build_sitemap(site, writeups)
        changed += build_feed(site, writeups)
        changed += build_search_index(writeups)
        for i, w in enumerate(writeups):
            changed += build_writeup(site, w, writeups, i)
        shutil.rmtree(tmp, ignore_errors=True)
        if changed:
            print(f"{RED}[!]{OFF} generated output is stale ({changed} file(s) differ) — run: python3 tools/build.py")
            return 1
        print(f"{GREEN}✓{OFF} generated output is up to date")
        return 0

    removed = prune(writeups)
    changed = 0
    changed += build_index(site, writeups)
    changed += build_cv(site)
    changed += build_404(site)
    changed += build_sitemap(site, writeups)
    changed += build_feed(site, writeups)
    changed += build_search_index(writeups)
    for i, w in enumerate(writeups):
        changed += build_writeup(site, w, writeups, i)

    print(f"{GREEN}✓{OFF} built {1 + len(writeups) + 4} pages from "
          f"{len(site['projects'])} projects, {len(site['certs'])} certs, {len(writeups)} writeups"
          + (f" · pruned {removed} stale writeup folder(s)" if removed else ""))
    print(f"  {changed} file(s) changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
