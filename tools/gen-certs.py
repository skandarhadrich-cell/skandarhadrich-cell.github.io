#!/usr/bin/env python3
"""Render page 1 of each certificate PDF into a web image.

The PDFs are the source and stay in the repository, but they are kept out of
the deployed site (see the SKIP list in stage.py): a certificate that the page
shows inline should not also be a file sitting there to download. Rasterising
page 1 is what makes that true rather than merely hidden -- there is no
download target on the server to find.

Re-run after replacing or adding a PDF in assets/certs/. The output is
committed, so this is a one-shot generator like tools/gen-assets.py, not part
of tools/build.py: the build must not depend on poppler being installed.

    python3 tools/gen-certs.py

Output lands in assets/certs/preview/<slug>.webp, referenced from
data/site.json as each certificate's "preview" key.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "certs")
OUT = os.path.join(SRC, "preview")

# source filename -> published slug. The slug is what appears in the URL and
# in site.json, so it is spelled out here rather than derived from the
# filename: "Certif webFun.pdf" would otherwise become "certif-webfun".
CERTS = {
    "Certif LLM Fine-Tuning.pdf":    "nvidia-llm",
    "Certif Machine Learning.pdf":   "365ds-ml",
    "Certif THM-JrPentest.pdf":      "thm-jrpentest",
    "Certif THM-SOC1.pdf":           "thm-soc1",
    "Certif DevSecOps.pdf":          "thm-devsecops",
    "Certif Security Engineer.pdf":  "thm-security-engineer",
    "Certif webFun.pdf":             "thm-web-fundamentals",
}

# long edge in pixels. A certificate is read in a lightbox up to ~1040px
# wide on a 1440px screen, so 1200 covers 2x there without wasting bytes on
# text nobody will zoom into.
SCALE_TO = 1200
QUALITY = 80


def need(prog: str) -> str:
    path = shutil.which(prog)
    if not path:
        sys.exit(f"error: {prog} is required to render the certificate previews")
    return path


def render(pdf: str, dest: str, pdftoppm: str, magick: str) -> int:
    with tempfile.TemporaryDirectory() as tmp:
        # -singlefile keeps pdftoppm from appending the page number, so the
        # stem is the output name exactly
        stem = os.path.join(tmp, "page")
        subprocess.run(
            [pdftoppm, "-png", "-f", "1", "-l", "1", "-singlefile",
             "-scale-to", str(SCALE_TO), pdf, stem],
            check=True,
        )
        subprocess.run(
            [magick, stem + ".png", "-strip", "-quality", str(QUALITY),
             "-define", "webp:method=6", dest],
            check=True,
        )
    return os.path.getsize(dest)


def main() -> int:
    pdftoppm = need("pdftoppm")
    magick = need("magick")
    os.makedirs(OUT, exist_ok=True)

    missing = [p for p in CERTS if not os.path.isfile(os.path.join(SRC, p))]
    if missing:
        for p in missing:
            print(f"  XX missing source: assets/certs/{p}")
        return 1

    rows = []
    for src, slug in CERTS.items():
        pdf = os.path.join(SRC, src)
        dest = os.path.join(OUT, slug + ".webp")
        size = render(pdf, dest, pdftoppm, magick)
        rows.append((src, os.path.getsize(pdf), size))

    pad = max(len(r[0]) for r in rows)
    print(f"  {'pdf'.ljust(pad)}   {'source':>9}  {'webp':>9}   saved")
    for name, pdf_sz, out_sz in rows:
        cut = 100 - round(out_sz * 100 / pdf_sz)
        print(f"  {name.ljust(pad)}  {pdf_sz / 1024:>7.1f}K  {out_sz / 1024:>7.1f}K   {cut}%")
    total = sum(r[2] for r in rows)
    print(f"\n  {len(rows)} previews in assets/certs/preview/, {total / 1024:.0f}K total")
    return 0


if __name__ == "__main__":
    sys.exit(main())