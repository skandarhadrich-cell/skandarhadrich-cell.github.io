#!/usr/bin/env python3
"""0xmrerror add-writeup — turn a CTF writeup folder into the live site.

Usage:
    python3 tools/add-writeup.py <ctf-name> [options]

Give it the CTF folder (name or path) and it does everything:

  A) Finds the writeup .md inside that folder and converts it into
     writeups/<slug>.html — h2/h3 headings, paragraphs, code blocks,
     lists, blockquotes, links, inline code, THM{...}/HTB{...} flag
     styling, and screenshots copied into writeups/images/<slug>/
  B) Adds the matching card in index.html with the next index number
  C) Commits and pushes to main, so GitHub Actions redeploys

The <ctf-name> is resolved like this:
  * a path to the folder or a direct .md file   (as given)
  * a folder name searched in the CTF base dir
    (default ~/Desktop/ctf-writeups — override with --base or the
     CTF_WRITEUPS_DIR environment variable)

Typical layout (asset/screenshot folders are skipped automatically):

    ctf-writeups/
    └── my-ctf/
        ├── my-ctf.md          <- the writeup
        └── assets/            <- screenshots, ignored for discovery

Options:
    --base <dir>        CTF base directory (default: ~/Desktop/ctf-writeups,
                        or the CTF_WRITEUPS_DIR environment variable)
    --slug <s>          Fragment slug (default: from the CTF folder name)
    --title "..."       Card title (default: the first # heading)
    --diff easy|medium|hard    (default: medium)
    --platform thm|htb|ctf     (default: thm)
    --time <n>          Read time in minutes (default: auto word estimate)
    --no-highlight      Skip bash/inline syntax highlighting
    --no-commit         Only write the fragment + card, leave git alone
    --no-push           Commit but do not push

Front matter (optional, at the very top of your .md) is also read:
    ---
    slug: my-ctf
    title: My CTF — Technique to Root
    diff: medium
    platform: thm
    ---
"""

import argparse
import html
import os
import re
import shutil
import subprocess
import sys
import unicodedata

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_PATH = os.path.join(APP_DIR, 'index.html')
WRITEUP_DIR = os.path.join(APP_DIR, 'writeups')

PLATFORM_LABEL = {'thm': 'TryHackMe', 'htb': 'Hack The Box', 'ctf': 'CTF'}

KNOWN_COMMANDS = set(
    """amass base64 binwalk cat cd chmod chown curl dirb dirsearch docker echo
enum4linux evil-winrm exiftool fcrackzip ffuf find getconf git gobuster gowitness
gpg grep gzip hashcat hydra id ifconfig ip john jq kubectl ldd less ls man
msfconsole mysql nc netcat nikto nmap openssl php php3 python python2 python3
python3.11 rdesktop ruby searchsploit service smbclient smbmap sqlmap ssh
ssh2john steghide strings sudo su systemctl tar tcpdump unzip vim wfuzz wget
whatweb whoami wireshark wordlists wpscan xxd xfreerdp zip2john 7z jp
""".split())


# ── helpers ─────────────────────────────────────────────────────────

def fail(msg):
    print('[!]', msg, file=sys.stderr)
    sys.exit(1)


def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
    return s or 'writeup'


def parse_frontmatter(text):
    if not text.startswith('---\n'):
        return {}, text
    end = text.find('\n---', 4)
    if end == -1:
        return {}, text
    fm = {}
    for line in text[4:end].split('\n'):
        if ':' in line:
            k, v = line.split(':', 1)
            fm[k.strip().lower()] = v.strip()
    return fm, text[end + 4:].lstrip('\n')


# ── writeup folder discovery ─────────────────────────────────────────

def is_ignored_dir(name):
    return name.lower().rstrip('s') in {'asset', 'asstet', 'screenshot'} or name.startswith('.')


def find_md(root):
    hits = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not is_ignored_dir(d)]
        for fn in sorted(filenames):
            if fn.lower().endswith('.md'):
                hits.append(os.path.join(dirpath, fn))
    return hits


def find_dir_under(base, name):
    name_l = name.lower()
    for root, dirnames, _ in os.walk(base):
        dirnames[:] = [d for d in dirnames if not is_ignored_dir(d)]
        for d in dirnames:
            if d.lower() == name_l:
                return os.path.join(root, d)
    for root, dirnames, _ in os.walk(base):
        dirnames[:] = [d for d in dirnames if not is_ignored_dir(d)]
        for d in dirnames:
            if name_l in d.lower():
                return os.path.join(root, d)
    return None


def resolve_md(target, base):
    if os.path.isfile(target):
        return target

    folder = None
    if os.path.isdir(target):
        folder = target
    elif base and os.path.isdir(os.path.join(base, target)):
        folder = os.path.join(base, target)
    elif base and os.path.isdir(base):
        folder = find_dir_under(base, target)
    if folder is None:
        fail('cannot find a writeup folder for "%s" (searched: %s)' % (target, base or '<none>'))

    hits = find_md(folder)
    if not hits:
        fail('no .md writeup found in %s' % folder)
    if len(hits) == 1:
        return hits[0]

    fav = os.path.basename(os.path.normpath(folder)).lower()
    for h in hits:
        if os.path.splitext(os.path.basename(h))[0].lower() == fav:
            return h
    fail('multiple .md files in %s — pick one with --markdown or point the folder right:\n  %s'
         % (folder, '\n  '.join(os.path.relpath(h, folder) for h in hits)))


# ── inline markdown → html ──────────────────────────────────────────

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    s = re.sub(r'!\[([^\]]*)\]\(([^)\s]+)\)', r'<img src="\2" alt="\1" loading="lazy"/>', s)
    s = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', r'<a href="\2" rel="noopener">\1</a>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<!\*)\*([^*\s][^*]*?)\*(?!\*)', r'<em>\1</em>', s)
    s = re.sub(r'(THM|HTB|CTF|FLAG)\{([^}]*)\}', r'\1<span class="tok-string">{\2}</span>', s)
    return s


# ── code blocks → <pre><code> with best-effort bash highlighting ─────

def highlight_code_line(raw):
    if not raw.strip():
        return ''
    stripped = raw.lstrip()
    if stripped.startswith('#'):
        return '<span class="tok-comment">' + html.escape(raw, quote=False) + '</span>'
    if stripped.startswith('$ '):
        body = html.escape(stripped[2:], quote=False)
        cmd = body.split(' ', 1)[0]
        base = cmd.split('/')[-1]
        styled = '<span class="tok-keyword">$</span> '
        if base in KNOWN_COMMANDS:
            styled += '<span class="tok-func">' + cmd + '</span>' + body[len(cmd):]
        else:
            styled += body
        return raw[:len(raw) - len(stripped)] + styled
    head = raw[:len(raw) - len(stripped)]
    m = re.match(r'^([\w./-]+)(\s+.*)?$', stripped)
    if m and m.group(1).split('/')[-1] in KNOWN_COMMANDS:
        return head + '<span class="tok-func">' + m.group(1) + '</span>' + (m.group(2) or '')
    return html.escape(raw, quote=False)


def code_block(lines, highlights):
    out = []
    for raw in lines:
        if not raw.strip():
            out.append('')
            continue
        out.append(highlight_code_line(raw) if highlights else html.escape(raw, quote=False))
    return '<pre><code>\n' + '\n'.join(out) + '\n</code></pre>'


# ── block markdown → html ───────────────────────────────────────────

def convert(md, highlights):
    lines = md.split('\n')
    i, n = 0, len(lines)
    out = []

    while i < n:
        ln = lines[i]

        if ln.startswith('```'):
            j, buf = i + 1, []
            while j < n and not lines[j].startswith('```'):
                buf.append(lines[j])
                j += 1
            out.append(code_block(buf, highlights))
            i = j + 1
            continue

        if ln.startswith('#'):
            m = re.match(r'^(#{1,6})\s+(.*)$', ln)
            tag = {1: 'h2', 2: 'h3'}.get(len(m.group(1)), 'h4')
            out.append('<{0}>{1}</{0}>'.format(tag, inline(m.group(2))))
            i += 1
            continue

        if ln.strip() == '---':
            out.append('<hr/>')
            i += 1
            continue

        if re.match(r'^\s*[-*]\s+', ln):
            buf = []
            while i < n and re.match(r'^\s*[-*]\s+', lines[i]):
                buf.append('<li>%s</li>' % inline(re.sub(r'^\s*[-*]\s+', '', lines[i])))
                i += 1
            out.append('<ul>\n' + '\n'.join(buf) + '\n</ul>')
            continue

        if re.match(r'^\s*\d+\.\s+', ln):
            buf = []
            while i < n and re.match(r'^\s*\d+\.\s+', lines[i]):
                buf.append('<li>%s</li>' % inline(re.sub(r'^\s*\d+\.\s+', '', lines[i])))
                i += 1
            out.append('<ol>\n' + '\n'.join(buf) + '\n</ol>')
            continue

        if ln.startswith('>'):
            buf = []
            while i < n and lines[i].startswith('>'):
                buf.append(inline(re.sub(r'^>\s?', '', lines[i])))
                i += 1
            out.append('<blockquote>%s</blockquote>' % ' '.join(buf))
            continue

        buf = []
        while i < n:
            line = lines[i]
            if (not line.strip() or line.startswith('#') or line.startswith('```')
                    or line.startswith('>') or re.match(r'^\s*([-*]|\d+\.)\s+', line)):
                break
            buf.append(line)
            i += 1
        if buf:
            out.append('<p>%s</p>' % inline('\n'.join(buf)))
        if i < n and not lines[i].strip():
            i += 1

    return '\n\n'.join(out)


# ── screenshots ─────────────────────────────────────────────────────

def copy_images(md_dir, md_text, slug):
    refs = set(re.findall(r'!\[[^\]]*\]\(([^)\s]+)\)', md_text))
    remap = {}
    for src in refs:
        if src.startswith(('http://', 'https://', 'data:', '/')):
            continue
        path = os.path.join(md_dir, src)
        if not os.path.exists(path):
            print('[~] image not found, keeping path as-is:', src)
            continue
        dest_dir = os.path.join(WRITEUP_DIR, 'images', slug)
        os.makedirs(dest_dir, exist_ok=True)
        shutil.copy2(path, os.path.join(dest_dir, os.path.basename(src)))
        remap[src] = 'images/%s/%s' % (slug, os.path.basename(src))
    return remap


# ── card + index.html ───────────────────────────────────────────────

def card_html(slug, title, diff, platform, minutes, idx):
    bits = []
    bits.append('<div class="writeup-card" data-writeup="%s" data-src="writeups/%s.html"'
                % (slug, slug))
    bits.append('     data-diff="%s" data-platform="%s" role="button" tabindex="0">' % (diff, platform))
    bits.append('        <span class="writeup-idx">%02d.</span>' % idx)
    bits.append('        <div class="writeup-info">')
    bits.append('          <div class="writeup-title">%s</div>' % html.escape(title))
    bits.append('          <div class="writeup-meta">')
    bits.append('            <span class="diff-badge diff-%s">%s</span>' % (diff, diff.capitalize()))
    bits.append('            <span class="platform-tag %s">%s</span>' % (platform, PLATFORM_LABEL.get(platform, platform)))
    bits.append('            <span class="read-time">\u23f1 %d min read</span>' % minutes)
    bits.append('          </div>')
    bits.append('        </div>')
    bits.append('        <span class="writeup-arrow">\u2192</span>')
    bits.append('      </div>')
    return '\n'.join(bits)


def insert_card(index_html, slug, card):
    if 'data-writeup="%s"' % slug in index_html:
        fail('a card for "%s" already exists in index.html' % slug)
    marker = '<span class="writeup-arrow">\u2192</span>\n      </div>'
    pos = index_html.rfind(marker)
    if pos == -1:
        fail('could not find the last writeup card in index.html')
    pos += len(marker)
    return index_html[:pos] + '\n\n      ' + card + index_html[pos:]


# ── git ─────────────────────────────────────────────────────────────

def git(*args):
    subprocess.run(['git', '-C', APP_DIR, *args], check=True)


# ── main ────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ctf', help='CTF folder name or path (a .md path also works)')
    ap.add_argument('--base', help='CTF base dir (default: ~/Desktop/ctf-writeups '
                                   'or $CTF_WRITEUPS_DIR)')
    ap.add_argument('--markdown', help='explicit path to the .md inside the folder')
    ap.add_argument('--slug', help='fragment slug (default: from the CTF folder name)')
    ap.add_argument('--title', help='card title (default: first # heading)')
    ap.add_argument('--diff', choices=['easy', 'medium', 'hard'])
    ap.add_argument('--platform', choices=['thm', 'htb', 'ctf'])
    ap.add_argument('--time', type=int, help='read time in minutes')
    ap.add_argument('--no-highlight', action='store_true', help='skip bash highlighting')
    ap.add_argument('--no-commit', action='store_true', help='write files only')
    ap.add_argument('--no-push', action='store_true', help='commit but do not push')
    args = ap.parse_args()

    base = args.base or os.environ.get('CTF_WRITEUPS_DIR') or os.path.expanduser('~/Desktop/ctf-writeups')

    md_path = args.markdown if args.markdown else resolve_md(args.ctf, base if os.path.isdir(base) else None)
    if not os.path.isfile(md_path):
        fail('writeup file not found: %s' % md_path)

    md_text = open(md_path, encoding='utf-8').read()
    fm, md_body = parse_frontmatter(md_text)

    def pick(arg_flag, fm_key):
        value = getattr(args, arg_flag)
        return value if value is not None else fm.get(fm_key)

    slug = args.slug or fm.get('slug')
    if not slug:
        slug = slugify(os.path.basename(os.path.dirname(os.path.abspath(md_path))))

    diff = pick('diff', 'diff') or 'medium'
    platform = pick('platform', 'platform') or 'thm'
    minutes = pick('time', 'time')
    if minutes is None:
        minutes = max(1, round(len(re.findall(r'\S+', md_body)) / 200))

    title = args.title if args.title is not None else fm.get('title')
    if not title:
        m = re.search(r'^#\s+(.+)$', md_body, re.M)
        title = m.group(1).strip() if m else slug.capitalize().replace('-', ' ')

    remap = copy_images(os.path.dirname(os.path.abspath(md_path)), md_body, slug)
    for old, new in remap.items():
        md_body = md_body.replace(old, new)

    # header comment mirroring writeups/template.html
    header = ('<!--\n'
              '  writeups/%s.html - content fragment (loaded into the modal)\n'
              '  Auto-generated by tools/add-writeup.py. Edit freely.\n'
              '  Syntax tokens: tok-func / tok-comment / tok-string / tok-num / tok-keyword\n'
              '-->\n') % slug

    fragment_path = os.path.join(WRITEUP_DIR, slug + '.html')
    if os.path.exists(fragment_path):
        fail('%s already exists — pick another slug or remove it' % os.path.relpath(fragment_path, APP_DIR))

    with open(fragment_path, 'w', encoding='utf-8') as f:
        f.write(header + convert(md_body, not args.no_highlight).strip() + '\n')

    index_html = open(INDEX_PATH, encoding='utf-8').read()
    idx = 1
    for m in re.finditer(r'writeup-idx">(\d+)\.', index_html):
        idx = max(idx, int(m.group(1)) + 1)

    card = card_html(slug, title, diff, platform, minutes, idx)
    open(INDEX_PATH, 'w', encoding='utf-8').write(insert_card(index_html, slug, card))

    print('[+] fragment : %s' % os.path.relpath(fragment_path, APP_DIR))
    print('[+] card     : #%02d %s (%s/%s, ~%d min)' % (idx, title, diff, platform, minutes))
    if remap:
        print('[+] images   :', ', '.join(sorted(set(remap.values()))))

    if args.no_commit:
        print('[~] done. Not touching git (--no-commit).')
        return

    if not os.path.isdir(os.path.join(APP_DIR, '.git')):
        fail('no git repo found — run with --no-commit instead')

    image_dir = os.path.join(WRITEUP_DIR, 'images', slug)
    files_to_add = [os.path.join('writeups', slug + '.html'), 'index.html']
    if os.path.isdir(image_dir):
        files_to_add.append(os.path.join('writeups', 'images', slug))
    git('add', *files_to_add)
    git('commit', '-m', 'Add %s writeup' % title)

    if args.no_push:
        print('[+] committed. Skipping push (--no-push).')
    else:
        git('push', 'origin', 'HEAD')
        print('[+] pushed to main — GitHub Actions redeploys in a minute.')


if __name__ == '__main__':
    main()