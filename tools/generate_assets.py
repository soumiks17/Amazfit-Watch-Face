"""Generate every image the watch face uses, plus app/watchface/layout.js.

    python tools/generate_assets.py

Deterministic: same code in, same pixels out. Needs Pillow + NumPy.
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from layout import (LAYOUT, INDEX_HOURS, INDEX_R, SCREEN, C, LG, MD, SM, CH, AMPM,
                    COLON, SUB_R, SUBDIALS)
import segfont as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "app", "assets", "active-2-round", "images")
S = 4  # supersampling factor

# Output scale. Everything is designed on the Active 2's 466 px screen;
# tools/make_balance.py sets OUTK = 480/466 to render the same face for a
# 480 px screen straight from the supersampled drawing (no re-scaling of
# finished PNGs), and JS_PATH to the other project's layout.js.
OUTK = 1.0
JS_PATH = os.path.join(ROOT, "app", "watchface", "layout.js")


def sc(v):
    """A 466-px design measurement at the output scale."""
    return int(round(v * OUTK))


def scaled_layout(node):
    if isinstance(node, bool):
        return node
    if isinstance(node, (int, float)):
        return sc(node)
    if isinstance(node, list):
        return [scaled_layout(v) for v in node]
    if isinstance(node, dict):
        return {k: scaled_layout(v) for k, v in node.items()}
    return node

# ---- palette -------------------------------------------------------------
LUME = (226, 236, 222)
ACCENT = (255, 98, 28)       # orange
TEAL = (38, 196, 206)
RED = (236, 58, 50)
AMBER = (255, 176, 40)
LCD_ON = (196, 238, 214)
LCD_DIM = (104, 128, 116)    # AOD variant of the LCD colour
GHOST = (22, 31, 27)
LCD_BG = (5, 9, 8)
LABEL = (138, 144, 150)
STEEL = (188, 193, 199)
STEEL_DARK = (48, 52, 57)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf"


def rgba(c, a=255):
    return tuple(c) + (a,)


def scale(poly, dx=0, dy=0, k=S):
    return [((x + dx) * k, (y + dy) * k) for x, y in poly]


def down(img, size):
    return img.resize((max(1, sc(size[0])), max(1, sc(size[1]))), Image.LANCZOS)


def font(px):
    return ImageFont.truetype(FONT_BOLD, int(px * S))


def polar(r, deg, cx=C, cy=C):
    a = math.radians(deg)
    return cx + r * math.sin(a), cy - r * math.cos(a)


# ---- glyphs --------------------------------------------------------------
SLANT = 6.0


def seven_geom(size):
    w, h = size["w"], size["h"]
    gw = w - h * math.tan(math.radians(SLANT))
    t = max(2.6, h * 0.15)
    return sf.seven_polys(gw, h, t, t * 0.14), h


def fourteen_geom(size):
    w, h = size["w"], size["h"]
    gw = w - h * math.tan(math.radians(SLANT))
    t = max(1.9, h * 0.13)
    return sf.fourteen_polys(gw, h, t, t * 0.18), h


def draw_segments(draw, polys, names, h, color, dx=0, dy=0):
    for n in names:
        draw.polygon(scale(sf.shear(polys[n], h, SLANT), dx, dy), fill=rgba(color))


def glyph_sprite(size, geom_fn, names, color):
    polys, h = geom_fn(size)
    im = Image.new("RGBA", (size["w"] * S, size["h"] * S), (0, 0, 0, 0))
    draw_segments(ImageDraw.Draw(im), polys, names, h, color)
    return down(im, (size["w"], size["h"]))


def text14(draw, text, x, y, size, color, adv=None):
    polys, h = fourteen_geom(size)
    adv = adv or size["w"] + 2
    for i, ch in enumerate(text):
        draw_segments(draw, polys, sf.FOURTEEN[ch], h, color, x + i * adv, y)


def label(d, text, x, y, px, color=LABEL, anchor="mm"):
    d.text((x * S, y * S), text, font=font(px), fill=rgba(color), anchor=anchor)


# ---- base texture ---------------------------------------------------------------
def fields(n):
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    return (xx + 0.5) / S, (yy + 0.5) / S


def base_layers(n):
    x, y = fields(n)
    dx, dy = x - C, y - C
    r = np.hypot(dx, dy)
    ang = (np.degrees(np.arctan2(dx, -dy)) + 360) % 360
    img = np.zeros((n, n, 3), np.float32)

    # dial: charcoal sunburst
    dial = r < 196
    burst = 21 + 2.2 * np.sin(np.radians(ang) * 120)
    for c, k in enumerate((1.0, 1.04, 1.12)):
        img[..., c][dial] = (burst * k)[dial]

    # chapter ring
    img[(r >= 196) & (r < 212)] = (13, 14, 16)

    # bezel: two-tone 24h ring (night half on top darker), brushed + bevel
    bz = (r >= 212) & (r <= 233.5)
    night = (ang < 90) | (ang >= 270)
    light = np.cos(np.radians(ang - 315))
    base = np.where(night, 30, 58) + 10 * light
    bevel = np.clip(1 - np.abs(r - 222.5) / 11, 0, 1) ** 0.5
    val = base * (0.6 + 0.4 * bevel)
    for c, k in enumerate((1.0, 1.03, 1.07)):
        img[..., c][bz] = (val * k)[bz]
    img[(r >= 211.5) & (r < 213)] = (92, 97, 103)
    img[(r >= 231.8) & (r <= 233.5)] = (70, 74, 79)

    # subdials: recessed with fine concentric grooves
    for cx, cy in SUBDIALS.values():
        rr = np.hypot(x - cx, y - cy)
        inside = rr < SUB_R
        groove = (np.floor(rr / 2.2) % 2 == 0)
        img[inside] = (12, 13, 15)
        img[inside & groove] = (17, 18, 21)
        rim = (rr >= SUB_R) & (rr < SUB_R + 3)
        shade = 120 + 40 * np.cos(np.radians(np.degrees(np.arctan2(x - cx, -(y - cy))) - 315))
        for c, k in enumerate((1.0, 1.03, 1.06)):
            img[..., c][rim] = (shade * k)[rim]
        img[(rr >= SUB_R + 3) & (rr < SUB_R + 4.5)] = (6, 6, 7)
    img[r > 233.5] = 0
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def round_mask(img):
    mask = Image.new("L", (SCREEN * S, SCREEN * S), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, SCREEN * S - 1, SCREEN * S - 1], fill=255)
    mask = down(mask, (SCREEN, SCREEN))
    out = Image.new("RGBA", img.size, (0, 0, 0, 255))
    out.paste(img, (0, 0), mask)
    return out


def rotated_text(canvas, text, cx, cy, px, angle, color):
    tile = Image.new("RGBA", (px * 4 * S, px * 2 * S), (0, 0, 0, 0))
    ImageDraw.Draw(tile).text((tile.width / 2, tile.height / 2), text, font=font(px), fill=rgba(color), anchor="mm")
    tile = tile.rotate(-angle, resample=Image.BICUBIC, expand=True)
    canvas.alpha_composite(tile, (int(cx * S - tile.width / 2), int(cy * S - tile.height / 2)))


def chamfer_rect(x, y, w, h, c):
    return [(x + c, y), (x + w - c, y), (x + w, y + c), (x + w, y + h - c),
            (x + w - c, y + h), (x + c, y + h), (x, y + h - c), (x, y + c)]


def draw_lcd(d, x, y, w, h, aod=False):
    if aod:
        d.polygon(scale(chamfer_rect(x, y, w, h, 7)), outline=rgba((44, 48, 52)), width=2 * S)
        return
    d.polygon(scale(chamfer_rect(x - 4, y - 4, w + 8, h + 8, 10)), fill=rgba((120, 126, 132)))
    d.polygon(scale(chamfer_rect(x - 2, y - 2, w + 4, h + 4, 8)), fill=rgba((28, 31, 35)))
    d.polygon(scale(chamfer_rect(x, y, w, h, 7)), fill=rgba(LCD_BG))


def arc_band(d, cx, cy, r0, r1, a0, a1, color, steps=None):
    """Filled annular band between clock angles a0..a1 (degrees)."""
    steps = steps or max(8, int(abs(a1 - a0) / 2))
    outer = [polar(r1, a0 + (a1 - a0) * i / steps, cx, cy) for i in range(steps + 1)]
    inner = [polar(r0, a1 - (a1 - a0) * i / steps, cx, cy) for i in range(steps + 1)]
    d.polygon(scale(outer + inner), fill=rgba(color))


def gauge_ticks(d, cx, cy, n, r0, r1, major_every, color=(170, 176, 182)):
    for i in range(n + 1):
        a = -135 + 270 * i / n
        major = i % major_every == 0
        d.line(scale([polar(r0 - (3 if major else 0), a, cx, cy), polar(r1, a, cx, cy)]),
               fill=rgba(color if major else (100, 106, 112)), width=int((2 if major else 1.2) * S))


# ---- background ---------------------------------------------------------------
def build_bg():
    n = SCREEN * S
    im = base_layers(n)
    d = ImageDraw.Draw(im)

    # 24-hour bezel scale
    for h in range(24):
        a = h * 15
        if h == 0:
            d.polygon(scale([polar(231, -3.4), polar(231, 3.4), polar(215, 0)]), fill=rgba(ACCENT))
        elif h % 2 == 0:
            col = (214, 219, 224) if (6 <= h <= 18) else (182, 188, 194)
            rotated_text(im, str(h), *polar(222.5, a), 12, a, col)
        else:
            px_, py_ = polar(222.5, a)
            d.ellipse(scale([(px_ - 1.6, py_ - 1.6), (px_ + 1.6, py_ + 1.6)]), fill=rgba((150, 156, 162)))

    # minute track
    for m in range(60):
        a = m * 6
        if m % 5 == 0:
            d.line(scale([polar(198, a), polar(210, a)]), fill=rgba((220, 225, 220)), width=int(2.6 * S))
        else:
            d.line(scale([polar(203, a), polar(210, a)]), fill=rgba((110, 116, 122)), width=int(1.3 * S))

    # hour markers: batons at 1/5/7/11, numerals at 2/4/8/10
    r0, r1 = INDEX_R
    for hr in INDEX_HOURS:
        a = hr * 30
        if hr in (2, 4, 8, 10):
            x, y = polar(178, a)
            txt = str(hr)
            f = font(30)
            d.text((x * S, y * S), txt, font=f, fill=rgba((70, 74, 80)), anchor="mm", stroke_width=int(2.2 * S), stroke_fill=rgba((70, 74, 80)))
            d.text((x * S, y * S), txt, font=f, fill=rgba(LUME), anchor="mm")
            continue
        def pt(r, off):
            x, y = polar(r, a)
            return x + math.cos(math.radians(a)) * off, y + math.sin(math.radians(a)) * off
        d.polygon(scale([pt(r0, -5), pt(r1, -7), pt(r1, 7), pt(r0, 5)]), fill=rgba((150, 156, 162)))
        d.polygon(scale([pt(r0 + 2.5, -3), pt(r1 - 2.5, -4.5), pt(r1 - 2.5, 4.5), pt(r0 + 2.5, 3)]), fill=rgba(LUME))

    # --- top subdial: date + battery ring
    cx, cy = SUBDIALS["date"]
    arc_band(d, cx, cy, 49.5, 53.5, -135, 135, GHOST)
    for i in range(11):
        a = -135 + 27 * i
        d.line(scale([polar(48, a, cx, cy), polar(54.5, a, cx, cy)]), fill=rgba((12, 13, 15)), width=int(1.6 * S))
    ch_p, ch_h = fourteen_geom(CH)
    md_p, md_h = seven_geom(MD)
    sm_p, sm_h = seven_geom(SM)
    for x, y in LAYOUT["weekday"]:
        draw_segments(d, ch_p, sf.ALL14, ch_h, GHOST, x, y)
    for x, y in LAYOUT["day"]:
        draw_segments(d, md_p, "abcdefg", md_h, GHOST, x, y)
    for x, y in LAYOUT["batt_pct"]:
        draw_segments(d, sm_p, "abcdefg", sm_h, GHOST, x, y)
    bx, by = LAYOUT["batt_pct"][-1]
    label(d, "%", bx + SM["w"] + 5, by + 11, 10)
    label(d, "E", *polar(47, -148, cx, cy), 8, (200, 80, 60))
    label(d, "F", *polar(47, 148, cx, cy), 8, LABEL)

    # --- left subdial: heart rate 40..200
    cx, cy = SUBDIALS["hr"]
    arc_band(d, cx, cy, 50, 53, -135, -135 + 270 * (120 - 40) / 160, TEAL)
    arc_band(d, cx, cy, 50, 53, -135 + 270 * 80 / 160, -135 + 270 * 120 / 160, AMBER)
    arc_band(d, cx, cy, 50, 53, -135 + 270 * 120 / 160, 135, RED)
    gauge_ticks(d, cx, cy, 16, 43, 49, 4)
    for v in (80, 120, 160):
        a = -135 + 270 * (v - 40) / 160
        label(d, str(v), *polar(35, a, cx, cy), 8.5, (170, 176, 182))
    for x, y in LAYOUT["hr"]:
        draw_segments(d, sm_p, "abcdefg", sm_h, GHOST, x, y)
    draw_heart(d, cx - 7, cy - 24, 14)
    label(d, "BPM", cx, 280, 8.5)

    # --- bottom subdial: steps 0..10K (same units as the digits)
    cx, cy = SUBDIALS["steps"]
    arc_band(d, cx, cy, 50, 53, -135, 135, (30, 64, 70))
    gauge_ticks(d, cx, cy, 20, 43, 49, 4)          # minor = 500 steps, major = 2K
    for v in (2, 4, 6, 8):
        a = -135 + 270 * v / 10
        label(d, f"{v}K", *polar(35, a, cx, cy), 8.5, (170, 176, 182))
    label(d, "10K", *polar(62.5, 135, cx, cy), 7.5, (150, 156, 162))
    for x, y in LAYOUT["steps"]:
        draw_segments(d, sm_p, "abcdefg", sm_h, GHOST, x, y)
    label(d, "STEPS", cx, 385, 8.5)

    # --- T2 LCD window
    lx, ly, lw, lh = LAYOUT["lcd"]
    draw_lcd(d, lx, ly, lw, lh)
    lg_p, lg_h = seven_geom(LG)
    for x, y in LAYOUT["t2_city"]:
        draw_segments(d, ch_p, sf.ALL14, ch_h, GHOST, x, y)
    for x, y in LAYOUT["t2_digits"]:
        draw_segments(d, lg_p, "abcdefg", lg_h, GHOST, x, y)
    colon(d, *LAYOUT["t2_colon"], GHOST)
    ax, ay = LAYOUT["t2_ampm"]
    text14(d, "PM", ax, ay, {"w": 12, "h": AMPM["h"]}, GHOST, adv=15)
    tx, ty = LAYOUT["t2_tag"]
    label(d, "T2", tx, ty + CH["h"] / 2 + 0.5, 15, ACCENT, anchor="lm")
    label(d, "WORLD TIME", lx + lw / 2, ly + lh + 12, 8.5)

    # brand line
    label(d, "RAMPART", C, 193, 9.5, (178, 184, 190))
    label(d, "GMT", C, 274, 8, TEAL)
    return round_mask(down(im, (SCREEN, SCREEN)))


def colon(d, x, y, color):
    for yy in (y + 10, y + 24):
        d.rectangle(scale([(x + 2, yy), (x + 6, yy + 4)]), fill=rgba(color))


def draw_heart(d, hx, hy, hw):
    r = hw / 4
    hh = hw * 0.9
    d.ellipse(scale([(hx, hy), (hx + 2 * r + 1, hy + 2 * r + 1)]), fill=rgba(RED))
    d.ellipse(scale([(hx + 2 * r - 1, hy), (hx + 4 * r, hy + 2 * r + 1)]), fill=rgba(RED))
    d.polygon(scale([(hx + 0.3, hy + r + 1.3), (hx + hw - 0.3, hy + r + 1.3), (hx + hw / 2, hy + hh)]), fill=rgba(RED))


def build_aod_bg():
    n = SCREEN * S
    im = Image.new("RGBA", (n, n), (0, 0, 0, 255))
    d = ImageDraw.Draw(im)
    for h in range(24):
        a = h * 15
        if h == 0:
            d.polygon(scale([polar(231, -3.4), polar(231, 3.4), polar(215, 0)]), fill=rgba((150, 64, 22)))
        elif h % 2 == 0:
            rotated_text(im, str(h), *polar(222.5, a), 12, a, (84, 88, 92))
    for hr in range(12):
        if hr in (0, 3, 6, 9):
            continue
        a = hr * 30
        d.line(scale([polar(186, a), polar(200, a)]), fill=rgba((96, 100, 104)), width=int(3 * S))
    draw_lcd(d, *LAYOUT["lcd"], aod=True)
    tx, ty = LAYOUT["t2_tag"]
    label(d, "T2", tx, ty + CH["h"] / 2 + 0.5, 15, (150, 64, 22), anchor="lm")
    return round_mask(down(im, (SCREEN, SCREEN)))


# ---- hands & needles ----------------------------------------------------------------
HOUR_OUTER = [(-6, 18), (-6, 6), (-10, -10), (-12, -30), (-12, -86), (0, -107), (12, -86), (12, -30), (10, -10), (6, 6), (6, 18)]
HOUR_LUME = [(-7, -34), (-7, -84), (0, -97), (7, -84), (7, -34)]
MIN_OUTER = [(-5, 18), (-5, 6), (-8, -12), (-9, -40), (-9, -146), (0, -167), (9, -146), (9, -40), (8, -12), (5, 6), (5, 18)]
MIN_LUME = [(-5, -44), (-5, -144), (0, -156), (5, -144), (5, -44)]


def hand_image(spec, outer, lume, aod=False):
    w, h, px, py = spec["w"], spec["h"], spec["px"], spec["py"]
    im = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    o = scale(outer, px, py)
    if aod:
        d.polygon(o, fill=rgba((0, 0, 0)))
        d.line(o + [o[0]], fill=rgba((170, 176, 172)), width=int(2 * S), joint="curve")
        d.polygon(scale(lume, px, py), fill=rgba((60, 66, 62)))
    else:
        d.polygon(o, fill=rgba(STEEL_DARK))
        inset = [(x * 0.78, y * 0.985) for x, y in outer]
        d.polygon(scale(inset, px, py), fill=rgba(STEEL))
        left = [(x, y) for x, y in inset if x <= 0]
        left = [(0, max(y for _, y in inset))] + left + [(0, min(y for _, y in inset))]
        d.polygon(scale(left, px, py), fill=rgba((150, 156, 162)))
        d.polygon(scale(lume, px, py), fill=rgba(LUME))
    return down(im, (w, h))


def second_hand(spec):
    w, h, px, py = spec["w"], spec["h"], spec["px"], spec["py"]
    im = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(scale([(-1.6, 36), (-1.6, -160), (-1.0, -188), (1.0, -188), (1.6, -160), (1.6, 36)], px, py), fill=rgba(ACCENT))
    d.rectangle(scale([(-2.6, -184), (2.6, -166)], px, py), fill=rgba(LUME))
    d.ellipse(scale([(-6.5, 25.5), (6.5, 38.5)], px, py), fill=rgba(ACCENT))
    d.ellipse(scale([(-2.5, 29.5), (2.5, 34.5)], px, py), fill=rgba((20, 20, 20)))
    d.ellipse(scale([(-5.5, -5.5), (5.5, 5.5)], px, py), fill=rgba(ACCENT))
    return down(im, (w, h))


def gmt_hand(spec, aod=False):
    w, h, px, py = spec["w"], spec["h"], spec["px"], spec["py"]
    im = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    col = (24, 110, 116) if aod else TEAL
    d.rectangle(scale([(-1.3, -186), (1.3, 0)], px, py), fill=rgba(col))
    d.polygon(scale([(-9, -184), (0, -207), (9, -184)], px, py), fill=rgba(col))
    if not aod:
        d.polygon(scale([(-4.5, -187), (0, -199), (4.5, -187)], px, py), fill=rgba(LUME))
    return down(im, (w, h))


def needle(spec, color):
    w, h, px, py = spec["w"], spec["h"], spec["px"], spec["py"]
    im = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(scale([(-2.4, 10), (-1.6, -30), (0, -46), (1.6, -30), (2.4, 10)], px, py), fill=rgba(color))
    d.ellipse(scale([(-5.5, -5.5), (5.5, 5.5)], px, py), fill=rgba(STEEL))
    d.ellipse(scale([(-2.2, -2.2), (2.2, 2.2)], px, py), fill=rgba((20, 20, 20)))
    return down(im, (w, h))


def hub(size, aod=False):
    im = Image.new("RGBA", (size * S, size * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = size / 2
    if aod:
        d.ellipse(scale([(c - 7, c - 7), (c + 7, c + 7)]), fill=rgba((20, 20, 20)), outline=rgba((170, 176, 172)), width=2 * S)
    else:
        d.ellipse(scale([(c - 11, c - 11), (c + 11, c + 11)]), fill=rgba(STEEL_DARK))
        d.ellipse(scale([(c - 9.5, c - 9.5), (c + 9.5, c + 9.5)]), fill=rgba(STEEL))
        d.ellipse(scale([(c - 5, c - 5), (c + 5, c + 5)]), fill=rgba(ACCENT))
        d.ellipse(scale([(c - 1.8, c - 1.8), (c + 1.8, c + 1.8)]), fill=rgba((20, 20, 20)))
    return down(im, (size, size))


# ---- battery ring frames ------------------------------------------------------------
def batt_frame(n):
    x, y, w, h = LAYOUT["batt_arc"]
    cx, cy = SUBDIALS["date"][0] - x, SUBDIALS["date"][1] - y
    im = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    col = ACCENT if n <= 2 else TEAL
    for i in range(n):
        a0 = -135 + 27 * i + 1.6
        a1 = -135 + 27 * (i + 1) - 1.6
        arc_band(d, cx, cy, 49.5, 53.5, a0, a1, col, steps=10)
    return down(im, (w, h))


# ---- tap feedback -----------------------------------------------------------------
ZONE_SUBDIAL = {"date": "date", "hr": "hr", "steps": "steps"}


def press_overlay(name, zx, zy, zw, zh):
    im = Image.new("RGBA", (zw * S, zh * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if name in ZONE_SUBDIAL:
        cx, cy = SUBDIALS[ZONE_SUBDIAL[name]]
        cx, cy = cx - zx, cy - zy
        d.ellipse(scale([(cx - 53, cy - 53), (cx + 53, cy + 53)]), fill=rgba(ACCENT, 38), outline=rgba(ACCENT), width=3 * S)
    elif name == "lcd":
        x, y, w, h = LAYOUT["lcd"]
        x, y = x - zx, y - zy
        d.polygon(scale(chamfer_rect(x - 4, y - 4, w + 8, h + 8, 10)), outline=rgba(ACCENT), width=3 * S)
    else:
        cx, cy = C - zx, C - zy
        for r, alpha, width in ((24, 60, 5), (21, 255, 3)):
            d.ellipse(scale([(cx - r, cy - r), (cx + r, cy + r)]), outline=rgba(ACCENT, alpha), width=int(width * S))
    return down(im, (zw, zh))


# ---- main ---------------------------------------------------------------------------
def save(img, name):
    img.save(os.path.join(OUT, name), optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".png"):
            os.remove(os.path.join(OUT, f))

    save(build_bg(), "bg.png")
    save(build_aod_bg(), "aod_bg.png")

    for sfx, color in (("", LCD_ON), ("a", LCD_DIM)):
        for ch in "0123456789":
            save(glyph_sprite(LG, seven_geom, list(sf.SEVEN[ch]), color), f"lg{sfx}_{ch}.png")
        im = Image.new("RGBA", (COLON["w"] * S, COLON["h"] * S), (0, 0, 0, 0))
        colon(ImageDraw.Draw(im), 0, 0, color)
        save(down(im, (COLON["w"], COLON["h"])), f"colon{sfx}.png")
        for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789":
            save(glyph_sprite(CH, fourteen_geom, sf.FOURTEEN[ch], color), f"ch{sfx}_{ch}.png")
        for tag in ("AM", "PM"):
            im = Image.new("RGBA", (AMPM["w"] * S, AMPM["h"] * S), (0, 0, 0, 0))
            text14(ImageDraw.Draw(im), tag, 0, 0, {"w": 12, "h": AMPM["h"]}, color, adv=15)
            save(down(im, (AMPM["w"], AMPM["h"])), f"{tag.lower()}{sfx}.png")

    for ch in "0123456789":
        save(glyph_sprite(MD, seven_geom, list(sf.SEVEN[ch]), LCD_ON), f"md_{ch}.png")
    for ch in "0123456789-":
        save(glyph_sprite(SM, seven_geom, list(sf.SEVEN[ch]), LCD_ON), f"sm_{'dash' if ch == '-' else ch}.png")
    for n in range(11):
        save(batt_frame(n), f"batt_{n}.png")

    hands = LAYOUT["hands"]
    save(hand_image(hands["hour"], HOUR_OUTER, HOUR_LUME), "hand_h.png")
    save(hand_image(hands["minute"], MIN_OUTER, MIN_LUME), "hand_m.png")
    save(second_hand(hands["second"]), "hand_s.png")
    save(hand_image(hands["hour"], HOUR_OUTER, HOUR_LUME, aod=True), "hand_h_aod.png")
    save(hand_image(hands["minute"], MIN_OUTER, MIN_LUME, aod=True), "hand_m_aod.png")
    save(gmt_hand(LAYOUT["gmt"]), "hand_gmt.png")
    save(gmt_hand(LAYOUT["gmt"], aod=True), "hand_gmt_aod.png")
    save(needle(LAYOUT["needle"], ACCENT), "needle_hr.png")
    save(needle(LAYOUT["needle"], TEAL), "needle_steps.png")
    save(hub(LAYOUT["hub"]["size"]), "hub.png")
    save(hub(LAYOUT["hub"]["size"], aod=True), "hub_aod.png")
    save(Image.new("RGBA", (4, 4), (0, 0, 0, 0)), "blank.png")

    for name, (zx, zy, zw, zh) in LAYOUT["zones"].items():
        save(Image.new("RGBA", (sc(zw), sc(zh)), (0, 0, 0, 0)), f"hit_{name}.png")
        save(press_overlay(name, zx, zy, zw, zh), f"press_{name}.png")

    with open(JS_PATH, "w") as f:
        f.write("// GENERATED by tools/generate_assets.py from tools/layout.py - do not edit by hand.\n")
        f.write("export const LAYOUT = " + json.dumps(scaled_layout(LAYOUT), indent=2) + "\n")
    print("assets written to", OUT)


if __name__ == "__main__":
    main()
