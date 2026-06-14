#!/usr/bin/env python3
"""Generate PWA icons for PartyTime Work from public/ptr-mark.png.

Mark on a #000000 field with "WORK" set below in gold (#FFB800), using
DIN Condensed Bold (closest available substitute for Barlow Condensed 700),
manually letter-spaced. Maskable variant pads content into the inner 60%.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK_PATH = os.path.join(ROOT, "public", "ptr-mark.png")
OUT_DIR = os.path.join(ROOT, "public", "icons")
FONT_PATH = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"

BG = (0, 0, 0, 255)          # #000000
GOLD = (255, 184, 0, 255)    # #FFB800
WORD = "WORK"

mark_src = Image.open(MARK_PATH).convert("RGBA")


def fit_mark(target_px):
    """Square-resize the mark to target_px, preserving aspect (mark is square)."""
    return mark_src.resize((target_px, target_px), Image.LANCZOS)


def draw_letterspaced(draw, text, font, spacing, color, center_x, top_y):
    """Draw text centered on center_x with manual letter spacing. Returns height."""
    # Per-glyph advance widths via bbox
    widths = [draw.textbbox((0, 0), ch, font=font)[2] for ch in text]
    total_w = sum(widths) + spacing * (len(text) - 1)
    # Vertical metrics from the full word
    bbox = draw.textbbox((0, 0), text, font=font)
    ascent_offset = bbox[1]
    x = center_x - total_w / 2
    for ch, w in zip(text, widths):
        draw.text((x, top_y - ascent_offset), ch, font=font, fill=color)
        x += w + spacing
    return bbox[3] - bbox[1]


def build(size, with_text=True, content_fraction=0.80):
    canvas = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(canvas)

    margin = int(size * (1 - content_fraction) / 2)
    usable = size - 2 * margin

    if with_text:
        text_h = int(usable * 0.20)
        gap = int(usable * 0.05)
        mark_size = usable - text_h - gap
        block_h = mark_size + gap + text_h
        start_y = (size - block_h) // 2

        mark = fit_mark(mark_size)
        canvas.alpha_composite(mark, ((size - mark_size) // 2, start_y))

        # Size the font so the word's cap height ≈ text_h
        font_size = text_h
        font = ImageFont.truetype(FONT_PATH, font_size)
        # Refine: scale font so measured glyph height matches text_h
        meas = draw.textbbox((0, 0), WORD, font=font)
        actual_h = meas[3] - meas[1]
        if actual_h > 0:
            font_size = max(8, int(font_size * text_h / actual_h))
            font = ImageFont.truetype(FONT_PATH, font_size)

        spacing = max(1, int(text_h * 0.14))
        text_top = start_y + mark_size + gap
        draw_letterspaced(draw, WORD, font, spacing, GOLD, size / 2, text_top)
    else:
        mark = fit_mark(usable)
        canvas.alpha_composite(mark, (margin, margin))

    return canvas


def save(img, name):
    path = os.path.join(OUT_DIR, name)
    img.save(path, "PNG")
    print(f"  wrote {name} ({img.size[0]}x{img.size[1]})")


os.makedirs(OUT_DIR, exist_ok=True)
print("Generating PWA icons:")
save(build(512, with_text=True, content_fraction=0.82), "icon-512.png")
save(build(192, with_text=True, content_fraction=0.82), "icon-192.png")
save(build(512, with_text=True, content_fraction=0.60), "icon-maskable-512.png")
save(build(180, with_text=True, content_fraction=0.82), "apple-touch-icon.png")
save(build(32, with_text=False, content_fraction=0.94), "favicon.png")
print("Done.")
