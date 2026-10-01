#!/usr/bin/env python3
"""0xmrerror.me — generate binary + vector assets.

Produces everything that cannot reasonably live in a text file:

    assets/og.png               1200x630 social share card
    assets/icon-192.png         PWA / manifest
    assets/icon-512.png         PWA / manifest (maskable)
    assets/apple-touch-icon.png 180x180 apple touch icon
    favicon.ico                 multi-resolution favicon

The icons and the OG card are drawn with Pillow so there is no external
design tool in the loop.

Run it after changing site.json identity or site colours:

    python3 tools/gen-assets.py

Requires Pillow:  python3 -m pip install Pillow
"""

from __future__ import annotations

import json
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required: python3 -m pip install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

# ── palette (must match css/tokens.css :root) ───────────────────────────────
BG0 = (8, 11, 16)
BG1 = (13, 17, 23)
BG2 = (17, 24, 32)
LINE = (27, 40, 54)
LINE_STRONG = (42, 61, 82)
ACCENT = (26, 255, 117)          # hsl(144 100% 55%)
ACCENT_TEXT = (0, 230, 92)        # hsl(144 100% 45%)
ACCENT_2 = (72, 209, 226)         # hsl(190 100% 60%)
TEXT_HI = (230, 237, 243)
TEXT = (195, 204, 214)
TEXT_DIM = (139, 152, 165)
TEXT_FAINT = (115, 127, 142)

# ── fonts (system TTFs; falls back to whatever exists) ──────────────────────
FONT_DIRS = [
    "/usr/share/fonts/truetype/firacode",
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts/truetype/noto",
    "/usr/share/fonts",
]

MONO = {
    "regular": ["FiraCode-Regular.ttf", "DejaVuSansMono.ttf", "LiberationMono-Regular.ttf"],
    "medium": ["FiraCode-Medium.ttf", "DejaVuSansMono.ttf", "LiberationMono-Regular.ttf"],
    "semibold": ["FiraCode-SemiBold.ttf", "FiraCode-Bold.ttf", "DejaVuSansMono-Bold.ttf"],
}
SANS = {
    "bold": ["OpenSans-Bold.ttf", "NotoSans-Bold.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"],
    "black": ["OpenSans-ExtraBold.ttf", "NotoSans-Black.ttf", "DejaVuSans-Bold.ttf"],
}


def find_font(family: str, name: str, size: int) -> ImageFont.FreeTypeFont:
    for directory in FONT_DIRS:
        for candidate in MONO[name] if family == "mono" else SANS[name]:
            path = os.path.join(directory, candidate)
            if os.path.exists(path):
                try:
                    return ImageFont.truetype(path, size)
                except OSError:
                    continue
    return ImageFont.load_default(size)


def load_site() -> dict:
    with open(os.path.join(ROOT, "data", "site.json"), encoding="utf-8") as fh:
        return json.load(fh)


# ── shared drawing helpers ──────────────────────────────────────────────────

def grid(draw: ImageDraw.ImageDraw, w: int, h: int, step: int = 46) -> None:
    for x in range(0, w, step):
        draw.line([(x, 0), (x, h)], fill=(16, 23, 31), width=1)
    for y in range(0, h, step):
        draw.line([(0, y), (w, y)], fill=(16, 23, 31), width=1)


def prompt_glyph(draw: ImageDraw.ImageDraw, ox: int, oy: int, scale: int,
                 accent=ACCENT, dim=TEXT_DIM) -> None:
    """The `>_` mark: chevron, underscore, cursor block."""
    t = max(2, int(scale * 0.16))
    draw.line([(ox, oy), (ox + scale * 0.42, oy + scale * 0.5),
               (ox, oy + scale)], fill=accent, width=t, joint="curve")
    draw.line([(ox + scale * 0.58, oy + scale * 0.94),
               (ox + scale * 1.14, oy + scale * 0.94)], fill=dim, width=t)
    draw.rectangle([ox + scale * 0.9, oy - scale * 0.06,
                    ox + scale * 1.14, oy + scale * 0.38], fill=accent)


def bloom(img: Image.Image, cx: int, cy: int, radius: int, colour, strength: int = 90) -> None:
    """A cheap radial glow: translucent ellipse stack, additive-ish."""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(strength, 0, -3):
        r = int(radius * i / strength)
        a = int(46 * (1 - i / strength) ** 1.7)
        d.ellipse([cx - r, cy - int(r * 0.72), cx + r, cy + int(r * 0.72)],
                  fill=colour[:3] + (a,))
    img.alpha_composite(layer)


# ── favicon / PWA icons ─────────────────────────────────────────────────────

def draw_icon(size: int, pad_ratio: float = 0.0) -> Image.Image:
    """Dark rounded square with the terminal mark, rendered at any size."""
    s = size * 4  # supersample, then downscale for clean edges
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(s * 0.22)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=BG0 + (255,))
    d.rounded_rectangle([s * 0.016, s * 0.016, s * 0.984, s * 0.984],
                        radius=int(r * 0.9), outline=LINE + (255,), width=max(1, int(s * 0.03)))
    inner = s * (0.20 + pad_ratio)
    prompt_glyph(d, int(inner), int(inner * 0.92), int(s - inner * 2))
    return img.resize((size, size), Image.LANCZOS)


def build_icons() -> None:
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512),
                       ("apple-touch-icon.png", 180)):
        draw_icon(size).convert("RGB").save(os.path.join(ASSETS, name), "PNG", optimize=True)
        print(f"  assets/{name:<24} {size}x{size}")

    # favicon.ico with 16/32/48 — Pillow writes the multi-resolution container
    frames = [draw_icon(n).convert("RGBA").resize((n, n), Image.LANCZOS) for n in (16, 32, 48)]
    frames[0].save(os.path.join(ROOT, "favicon.ico"), format="ICO",
                   sizes=[(16, 16), (32, 32), (48, 48)],
                   append_images=frames[1:])
    print("  favicon.ico                16/32/48")


# ── social share card ───────────────────────────────────────────────────────

def build_og(site: dict) -> None:
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), BG0 + (255,))
    d = ImageDraw.Draw(img)

    grid(d, W, H)
    bloom(img, 250, 120, 520, ACCENT)
    bloom(img, 1040, 90, 420, ACCENT_2)
    bloom(img, 600, 640, 620, ACCENT, strength=60)

    # subtle vignette so the edges do not fight the text
    vig = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    vd = ImageDraw.Draw(vig)
    for i in range(120):
        a = int(90 * (i / 120) ** 2.4)
        vd.rectangle([i * 0.5, i * 0.35, W - i * 0.5, H - i * 0.35], outline=(4, 6, 9, a))
    img.alpha_composite(vig)

    ident = site["identity"]
    mono_r = find_font("mono", "regular", 21)
    mono_sb = find_font("mono", "semibold", 22)
    sans_b = find_font("sans", "black", 78)
    sans_b2 = find_font("sans", "black", 30)
    mono_sm = find_font("mono", "regular", 19)
    mono_tiny = find_font("mono", "medium", 17)

    # ── terminal chrome ──
    d.rounded_rectangle([64, 56, W - 64, H - 56], radius=10,
                        fill=(10, 14, 19, 214), outline=LINE + (255,), width=2)
    d.rounded_rectangle([64, 56, W - 64, 112], radius=10, fill=BG2 + (255,))
    d.rectangle([64, 100, W - 64, 112], fill=BG2 + (255,))
    d.line([(64, 112), (W - 64, 112)], fill=LINE + (255,), width=2)
    for i, c in enumerate(((255, 95, 87), (254, 188, 46), (40, 200, 64))):
        d.ellipse([90 + i * 26, 78, 102 + i * 26, 90], fill=c)
    d.text((W / 2, 85), "0xmrerror@terminal:~/portfolio", font=mono_r,
           fill=TEXT_FAINT, anchor="mm")

    # ── prompt + headline ──
    y = 176
    x = 112
    d.text((x, y), "0xmrerror", font=mono_sb, fill=ACCENT_TEXT)
    off = d.textlength("0xmrerror", font=mono_sb)
    d.text((x + off, y), "@terminal", font=mono_r, fill=TEXT_FAINT)
    off += d.textlength("@terminal", font=mono_r)
    d.text((x + off, y), ":~$", font=mono_r, fill=TEXT_FAINT)
    off += d.textlength(":~$", font=mono_r)
    d.text((x + off + 18, y), "cat README.md --brief", font=mono_sb, fill=TEXT_HI)

    y += 62
    d.text((x, y), site["site"]["name"], font=sans_b, fill=TEXT_HI)
    y += 96
    d.text((x, y), "REVERSE ENGINEERING", font=sans_b2, fill=ACCENT_TEXT)
    off = d.textlength("REVERSE ENGINEERING", font=sans_b2)
    d.text((x + off, y), "  ·  ", font=sans_b2, fill=LINE_STRONG)
    off += d.textlength("  ·  ", font=sans_b2)
    d.text((x + off, y), "MALWARE ANALYSIS", font=sans_b2, fill=ACCENT_TEXT)
    off += d.textlength("MALWARE ANALYSIS", font=sans_b2)
    d.text((x + off, y), "  ·  ", font=sans_b2, fill=LINE_STRONG)
    off += d.textlength("  ·  ", font=sans_b2)
    d.text((x + off, y), "SOC AUTOMATION", font=sans_b2, fill=ACCENT_TEXT)

    y += 60
    d.line([(x, y), (W - 112, y)], fill=LINE + (255,), width=1)
    y += 26
    wrapped = wrap(f"{ident['location']}  ·  {ident['role']} @ {ident['org']}  ·  ENIT 77th at HTB University CTF 2025",
                   mono_sm, W - 224)
    for line in wrapped:
        d.text((x, y), line, font=mono_sm, fill=TEXT_DIM)
        y += 30

    # ── stat strip ──
    y = 500
    stats = [("Top 1%", "TryHackMe"), ("77th", "HTB Uni CTF 2025"),
             ("7", "certifications"), ("Feb 2027", "available")]
    col = (W - 224) / 4
    for i, (value, label) in enumerate(stats):
        cx = 112 + col * i + col / 2
        d.text((cx, y), value, font=find_font("mono", "semibold", 34),
               fill=ACCENT if i != 3 else (63, 185, 80), anchor="mm")
        d.text((cx, y + 34), label.upper(), font=mono_tiny, fill=TEXT_FAINT, anchor="mm")
        if i:
            d.line([(112 + col * i, y - 18), (112 + col * i, y + 46)], fill=LINE + (255,), width=1)

    # ── corner mark ──
    prompt_glyph(d, W - 232, H - 214, 104, dim=LINE_STRONG)
    d.text((W - 112, H - 100), "0xmrerror.me", font=mono_tiny, fill=TEXT_FAINT, anchor="ra")

    out = os.path.join(ASSETS, "og.png")
    img.convert("RGB").save(out, "PNG", optimize=True)
    print(f"  assets/og.png              1200x630  ({os.path.getsize(out) / 1024:.0f} KB)")


def wrap(text: str, font, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if font.getlength(trial) <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def main() -> int:
    os.makedirs(ASSETS, exist_ok=True)
    site = load_site()
    print("generating assets")
    build_icons()
    build_og(site)
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
