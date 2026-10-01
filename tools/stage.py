#!/usr/bin/env python3
"""Assemble a clean, deployable copy of the site into _site/.

The generated pages are committed at the repository root, which is also
where the sources live (data/, templates/, tools/, .github/). Handing
the repository root to the Pages artifact action therefore publishes
all of that -- including .git, so the full history and the remote URL
become readable at /.git/config. This copies an explicit allow-list
instead, so what gets deployed is a decision recorded in one place
rather than whatever happens to be in the working tree.

    python3 tools/stage.py [--out _site] [--check]

--check verifies the staged tree matches what this script would produce
without writing anything, so CI can fail on drift the same way
build.py --check does.
"""
from __future__ import annotations

import argparse
import filecmp
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Everything the live site needs, and nothing else.
FILES = [
    "index.html",
    "cv.html",
    "404.html",
    "sitemap.xml",
    "feed.xml",
    "search-index.json",
    "robots.txt",
    "site.webmanifest",
    "favicon.ico",
    "favicon.svg",
    "CNAME",          # required for the custom domain to survive deploy
    ".nojekyll",      # stop Pages swallowing _underscore paths
    "LICENSE",
]
DIRS = ["css", "js", "fonts", "assets", "writeups"]

# Written by this script, not by build.py.
GENERATED = [".nojekyll"]

# Kept in the repository, never deployed: the certificate PDFs under
# assets/certs/ are the source tools/gen-certs.py renders the inline previews
# from. The site shows those renderings, and shipping the PDFs too would put
# back the download the preview exists to avoid. Scoped to that directory
# rather than to the .pdf extension, because assets/CV_Eng.pdf is a deliberate
# download and must still ship. Keyed on the directory, so a newly added
# certificate is excluded by default -- the safe way round.
SKIP_DIRS = (os.path.join("assets", "certs"),)


def is_generated(rel: str) -> bool:
    return rel in GENERATED or rel.startswith(".nojekyll.")


def is_skipped(rel: str) -> bool:
    return rel.lower().endswith(".pdf") and rel.startswith(SKIP_DIRS)


def expected_files() -> list[str]:
    out = [f for f in FILES if os.path.exists(os.path.join(ROOT, f))]
    for d in DIRS:
        for dirpath, dirs, files in os.walk(os.path.join(ROOT, d)):
            dirs[:] = sorted(x for x in dirs if x != "__pycache__")
            for fn in sorted(files):
                p = os.path.join(dirpath, fn)
                rel = os.path.relpath(p, ROOT)
                if not is_skipped(rel):
                    out.append(rel)
    return sorted(out)


def write_nojekyll(path: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("")


def build(out_dir: str) -> int:
    out = os.path.join(ROOT, out_dir)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out, exist_ok=True)

    for rel in expected_files():
        src = os.path.join(ROOT, rel)
        dst = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)

    write_nojekyll(os.path.join(out, ".nojekyll"))
    return len(expected_files()) + 1


def check(out_dir: str) -> int:
    out = os.path.join(ROOT, out_dir)
    if not os.path.isdir(out):
        print(f"::error::{out_dir}/ does not exist -- run: python3 tools/stage.py")
        return 1

    # Belt and braces on the skip list: --check already fails on any file in
    # _site/ that expected_files() does not name, so a leaked PDF would be
    # caught there. This names it explicitly, because "a PDF shipped" deserves
    # its own message rather than an "extra file" one.
    # Accumulated across every check below, so this list is created once and
    # only ever appended to. It used to be assigned the leak findings here and
    # then reassigned to [] further down, which silently discarded them -- the
    # check read as present in the source and could never fail.
    problems: list[str] = []
    for rel in sorted(
        rel for rel in (
            os.path.relpath(os.path.join(dp, fn), out)
            for dp, _, fns in os.walk(out) for fn in fns
        )
        if is_skipped(rel)
    ):
        problems.append(
            f"{out_dir}/{rel}  (a skipped file is staged -- it must never be deployed)"
        )

    want = set(expected_files()) | {".nojekyll"}
    have = set()
    for dirpath, dirs, files in os.walk(out):
        dirs[:] = [x for x in dirs if x != "__pycache__"]
        for fn in files:
            have.add(os.path.relpath(os.path.join(dirpath, fn), out))

    for missing in sorted(want - have):
        problems.append(f"{out_dir}/{missing}  (staged tree is missing it)")
    for extra in sorted(have - want):
        problems.append(f"{out_dir}/{extra}  (staged tree should not contain it)")

    for rel in sorted(want & have):
        a, b = os.path.join(ROOT, rel), os.path.join(out, rel)
        if rel == ".nojekyll":
            if os.path.getsize(b) != 0:
                problems.append(".nojekyll  (should be empty)")
        elif os.path.isfile(a) and not filecmp.cmp(a, b, shallow=False):
            problems.append(f"{out_dir}/{rel}  (differs from the repository copy)")

    if problems:
        print("::error::staged site is out of date:")
        for p in problems:
            print("  " + p)
        print(f"\nrun: python3 tools/stage.py")
        return 1
    print(f"\u2713 staged site is up to date ({len(want)} files in {out_dir}/)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default="_site", help="output directory (default: _site)")
    ap.add_argument("--check", action="store_true",
                    help="verify the staged tree without writing anything")
    args = ap.parse_args()

    if args.check:
        return check(args.out)

    n = build(args.out)
    print(f"\u2713 staged {n} files into {args.out}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
