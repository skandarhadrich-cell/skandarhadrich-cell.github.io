#!/usr/bin/env python3
"""0xmrerror.me — scaffold a new writeup.

The old version of this script did regex surgery on a 900-line index.html and
then ran `git add && git commit && git push` behind your back.  Both halves are
gone.  This version only writes one file — data/writeups/<NN>-<slug>.md — runs
the build, and prints what to do next.  Committing and pushing are opt-in
because a tool that publishes to the internet without being asked is a bug,
not a feature.

    # scaffold interactively
    python3 tools/add-writeup.py

    # or non-interactively
    python3 tools/add-writeup.py --title "Watcher — LFI to Root" \\
        --type web --diff hard --platform thm --summary "One line, one sentence."

    # import the notes and screenshots from a CTF folder
    python3 tools/add-writeup.py --from ~/ctf/watcher

    # list what exists, and show the next free order number
    python3 tools/add-writeup.py --list
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
WUDATA = os.path.join(DATA, "writeups")
IMG_DST = os.path.join(ROOT, "assets", "writeups")

TYPES = ["web", "re", "pwn", "forensics", "crypto", "osint"]
DIFFS = ["easy", "medium", "hard"]
PLATFORMS = ["thm", "htb", "ctf"]

GREEN, DIM, RED, YEL, BOLD, OFF = (
    "\033[32m", "\033[2m", "\033[31m", "\033[33m", "\033[1m", "\033[0m")

STARTER = """---
title: "{title}"
slug: {slug}
type: {wtype}
diff: {diff}
platform: {platform}
read_time: 12
summary: "{summary}"
date: {today}
tags: {tags}
---

## The brief

What the box asked for, in one or two sentences. Then the actual objective, so
a reader knows what "solved" meant here.

## Reconnaissance

```bash
# commands you actually ran, in order, with the output that mattered
nmap -sC -sV -p- 10.10.11.42
```

## Phase 1 — initial access

The first thing that worked, and what it gave you.

## Phase 2 — <the next step>

## Flag

```text
THM{{...}}
```

## What I would do differently

One short paragraph. This is the part readers remember, and the part most
write-ups skip.
"""


def slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return re.sub(r"-{2,}", "-", s) or "writeup"


def existing() -> list[tuple[int, str, str, str]]:
    rows = []
    for fn in sorted(os.listdir(WUDATA)):
        if not fn.endswith(".md"):
            continue
        m = re.match(r"(\d+)-(.*)\.md$", fn)
        if m:
            title = diff = ""
            for line in open(os.path.join(WUDATA, fn), encoding="utf-8"):
                if line.startswith("title:"):
                    title = line[7:].strip().strip('"')
                elif line.startswith("diff:"):
                    diff = line[5:].strip()
                    if diff not in DIFFS:
                        diff = ""
                if title and diff:
                    break
            rows.append((int(m.group(1)), m.group(2), title, diff))
    return rows


def next_order(diff: str = "") -> tuple[int, str]:
    """Sort position for a new write-up, inside its own difficulty's band.

    The NN- prefix is the only order the build knows, and README says the list
    reads hard first. Appending at max+10 buried every new write-up under all
    fourteen boxes regardless of difficulty -- which is how jitfp ended up at
    140 as the last entry while being a hard one.

    So a new write-up lands just after the last write-up of the same difficulty.
    If that slot is occupied by a different difficulty there is no number left
    in the band and the caller has to renumber; say so rather than silently
    producing a file that sorts into the wrong section.
    """
    rows = existing()
    if not rows:
        return 10, ""
    taken = {r[0] for r in rows}
    band = [r[0] for r in rows if diff and r[3] == diff]
    order = (max(band) // 10 + 1) * 10 if band else (max(taken) // 10 + 1) * 10
    clash = next((r for r in rows if r[0] == order), None)
    note = ""
    if clash:
        note = (f"position {order} is taken by {clash[1]!r} ({clash[3] or 'no diff'}); "
                f"renumber to keep {diff} write-ups above the rest")
    return max(order, 10), note


def ask(prompt: str, default: str = "") -> str:
    try:
        raw = input(f"{DIM}{prompt}{OFF} [{default}]: ").strip()
    except (EOFError, KeyboardInterrupt):
        sys.exit("\n" + DIM + "aborted" + OFF)
    return raw or default


def pick(label: str, options: list[str], default: str) -> str:
    if sys.stdin.isatty():
        print(f"{DIM}  {label}:{'/'.join(options)}{OFF}")
    return ask(label, default) if sys.stdin.isatty() else default


def copy_images(src: str, slug: str) -> int:
    """Copy screenshots next to the write-up so the page is self-contained."""
    dest = os.path.join(IMG_DST, slug)
    os.makedirs(dest, exist_ok=True)
    n = 0
    for dirpath, _, files in os.walk(src):
        for fn in files:
            if not re.search(r"\.(png|jpe?g|gif|webp|svg)$", fn, re.I):
                continue
            stem = slugify(os.path.splitext(fn)[0])
            ext = os.path.splitext(fn)[1].lower()
            shutil.copy2(os.path.join(dirpath, fn), os.path.join(dest, f"{stem}{ext}"))
            n += 1
    return n


def body_from_folder(src: str) -> str:
    """Seed the body from a notes/README file if the folder has one."""
    for name in ("writeup.md", "notes.md", "README.md", "readme.md", "index.md"):
        p = os.path.join(src, name)
        if os.path.isfile(p):
            return open(p, encoding="utf-8").read().strip() + "\n"
    return ""


def rebuild() -> None:
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py")], check=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Scaffold a new writeup for 0xmrerror.me")
    ap.add_argument("--title")
    ap.add_argument("--slug")
    ap.add_argument("--type", choices=TYPES)
    ap.add_argument("--diff", choices=DIFFS)
    ap.add_argument("--platform", choices=PLATFORMS)
    ap.add_argument("--summary")
    ap.add_argument("--tags", help="comma separated")
    ap.add_argument("--from", dest="src", help="import notes + screenshots from a folder")
    ap.add_argument("--order", type=int, help="sort position, e.g. 45")
    ap.add_argument("--list", action="store_true", help="show existing writeups and exit")
    ap.add_argument("--force", action="store_true", help="overwrite an existing file")
    ap.add_argument("--no-build", action="store_true", help="do not run build.py")
    args = ap.parse_args()

    if args.list:
        rows = existing()
        print(f"\n{BOLD}{len(rows)} writeups in data/writeups/{OFF}\n")
        for num, slug, title, diff in rows:
            tag = {c: c for c in DIFFS}.get(diff, "")
            print(f"  {DIM}{num:>4}{OFF}  {GREEN}{slug}{OFF}  {DIM}{tag:>6}{OFF}  {DIM}{title}{OFF}")
        print("\n  next free order by difficulty: "
              + "  ".join(f"{d} {next_order(d)[0]}" for d in DIFFS) + "\n")
        return 0

    src = os.path.abspath(os.path.expanduser(args.src)) if args.src else None
    if src and not os.path.isdir(src):
        print(f"{RED}[!]{OFF} not a directory: {src}")
        return 1

    title = args.title or ask("title")
    slug = args.slug or slugify(title.split("—")[0].strip())
    wtype = args.type or pick("type", TYPES, "web")
    diff = args.diff or pick("difficulty", DIFFS, "medium")
    platform = args.platform or pick("platform", PLATFORMS, "picoctf")
    summary = args.summary or ask("summary (one line, under 180 chars)")

    if len(summary) > 180:
        print(f"{YEL}[!]{OFF} summary is {len(summary)} chars; it is used as the meta "
              f"description, so anything past ~180 gets truncated by search engines.")
        summary = summary[:177].rsplit(" ", 1)[0] + "…"

    if args.order is not None:
        order, note = args.order, ""
    else:
        order, note = next_order(diff)
        if note:
            print(f"{YEL}[!]{OFF} {note}")
    fname = os.path.join(WUDATA, f"{order}-{slug}.md")
    if os.path.exists(fname) and not args.force:
        print(f"{RED}[!]{OFF} {os.path.relpath(fname, ROOT)} already exists — "
              f"use --force to overwrite, or --order to place it elsewhere")
        return 1

    import datetime as dt
    body = body_from_folder(src) if src else ""
    text = STARTER.format(
        title=title.replace('"', "'"), slug=slug, wtype=wtype, diff=diff,
        platform=platform, summary=summary, today=dt.date.today().isoformat(),
        tags=args.tags or f"{diff}, {platform}",
    )
    if body:
        # keep the imported notes, drop the scaffold's placeholder sections
        head, _, _ = text.partition("## The brief")
        text = head + body + "\n"

    os.makedirs(WUDATA, exist_ok=True)
    with open(fname, "w", encoding="utf-8") as fh:
        fh.write(text)

    n_img = copy_images(src, slug) if src else 0

    print(f"\n{GREEN}✓{OFF} created {BOLD}{os.path.relpath(fname, ROOT)}{OFF}")
    if n_img:
        print(f"  {DIM}copied {n_img} screenshot(s) to assets/writeups/{slug}/{OFF}")
    print(f"  {DIM}order {order} · type {wtype} · {diff} · {platform}{OFF}\n")
    print(f"  {BOLD}next:{OFF} write the body, then run")
    print(f"    python3 tools/build.py")
    print(f"  and preview at {DIM}http://localhost:8000/writeups/{slug}/{OFF}")
    print(f"  {DIM}this tool does not commit or push — review, then commit yourself{OFF}\n")

    if not args.no_build:
        rebuild()
    return 0


if __name__ == "__main__":
    sys.exit(main())
