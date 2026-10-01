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

Output lands in assets/certs/preview/, referenced from data/site.json as each
certificate's "preview" key. Two rungs per certificate:

    <slug>.webp        1200px  the certificate overlay
    <slug>-thumb.webp   640px  the row thumbnail

The thumbnail is a separate file because the row shows it at 64px and grows it
to 150px on hover: at 2x that is 300px of pixels, so 640 covers it with room
to spare. Sizing the row off the 1200px file instead would mean 218K of images
for marks that never render wider than 150 CSS px.
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
    "Certif CCNA_ITN.pdf":           "cisco-ccna",
    "Certif THM-JrPentest.pdf":      "thm-jrpentest",
    "Certif THM-SOC1.pdf":           "thm-soc1",
    "Certif DevSecOps.pdf":          "thm-devsecops",
    "Certif Security Engineer.pdf":  "thm-security-engineer",
    "Certif webFun.pdf":             "thm-web-fundamentals",
}

# Long edge of the overlay rung, in pixels. A certificate is read in the overlay
# up to ~1040px wide on a 1440px screen, so 1200 covers 2x there without
# wasting bytes on text nobody zooms into. Everything else is downscaled from
# this one rasterisation rather than re-rendered, so the two rungs are always
# the same page of the same document at different sizes.
OVERLAY_TO = 1200

# Long edge of the row thumbnail. 150 CSS px at 2x is 300px; 640 is the next
# sensible step up and keeps the eight of them around 90K together.
THUMB_TO = 640

QUALITY = 80


def need(prog: str) -> str:
    path = shutil.which(prog)
    if not path:
        sys.exit(f"error: {prog} is required to render the certificate previews")
    return path


def render(pdf: str, dest: str, source_png: str, width: int,
           magick: str) -> int:
    cmd = [magick, source_png, "-resize", f"{width}x{width}",
           "-strip", "-quality", str(QUALITY), "-define", "webp:method=6", dest]
    subprocess.run(cmd, check=True)
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
    with tempfile.TemporaryDirectory() as tmp:
        for src, slug in CERTS.items():
            pdf = os.path.join(SRC, src)
            # -singlefile keeps pdftoppm from appending the page number, so the
            # stem is the output name exactly
            stem = os.path.join(tmp, "page")
            subprocess.run(
                [pdftoppm, "-png", "-f", "1", "-l", "1", "-singlefile",
                 "-scale-to", str(OVERLAY_TO), pdf, stem],
                check=True,
            )
            png = stem + ".png"
            full = os.path.join(OUT, slug + ".webp")
            thumb = os.path.join(OUT, slug + "-thumb.webp")
            full_sz = render(pdf, full, png, OVERLAY_TO, magick)
            thumb_sz = render(pdf, thumb, png, THUMB_TO, magick)
            rows.append((src, os.path.getsize(pdf), thumb_sz, full_sz))

    pad = max(len(r[0]) for r in rows)
    print(f"  {'pdf'.ljust(pad)}   {'source':>9}  {'thumb':>9}  {'overlay':>9}")
    for name, pdf_sz, thumb_sz, full_sz in rows:
        print(f"  {name.ljust(pad)}  {pdf_sz / 1024:>7.1f}K  {thumb_sz / 1024:>7.1f}K"
              f"  {full_sz / 1024:>7.1f}K")
    tsum = sum(r[2] for r in rows)
    fsum = sum(r[3] for r in rows)
    print(f"\n  {len(rows)} certificates in assets/certs/preview/")
    print(f"  {len(rows)} thumbnails  {tsum / 1024:.0f}K  "
          f"({tsum / len(rows) / 1024:.0f}K each)")
    print(f"  {len(rows)} overlays    {fsum / 1024:.0f}K  "
          f"({fsum / len(rows) / 1024:.0f}K each)")
    return 0


if __name__ == "__main__":
    sys.exit(main())