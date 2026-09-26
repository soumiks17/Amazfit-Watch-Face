"""Generate every image the watch face uses, plus app/watchface/layout.js.

    python tools/generate_assets.py

Deterministic: same code in, same pixels out. Needs Pillow + NumPy.
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from layout import LAYOUT, INDEX_HOURS, INDEX_R, SCREEN, C, LG, SM, CH, AMPM, COLON, BATT
import segfont as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "app", "assets", "active-2-round", "images")
S = 4  # supersampling factor

# ---- palette -------------------------------------------------------------
LUME = (226, 236, 222)
ACCENT = (255, 98, 28)
HEART = (255, 64, 56)
LCD_ON = (196, 238, 214)
LCD_DIM = (104, 128, 116)      # AOD variant of the LCD colour
GHOST = (22, 31, 27)
LCD_BG = (5, 9, 8)
LABEL = (128, 134, 140)
STEEL = (188, 193, 199)
STEEL_DARK = (48, 52, 57)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf"


def rgba(c, a=255):
    return tuple(c) + (a,)


def scale(poly, dx=0, dy=0, k=S):
    return [((x + dx) * k, (y + dy) * k) for x, y in poly]


def down(img, size):
    return img.resize(size, Image.LANCZOS)


# ---- glyphs --------------------------------------------------------------
SLANT = 6.0


def seven_geom(size):
    w, h = size["w"], size["h"]
    k = math.tan(math.radians(SLANT))
    gw = w - h * k  # upright glyph width before shear
    t = max(3.0, h * 0.15)
    return sf.seven_polys(gw, h, t, t * 0.14), h


def fourteen_geom(size):
    w, h = size["w"], size["h"]
    k = math.tan(math.radians(SLANT))
    gw = w - h * k
    t = max(2.2, h * 0.13)
    return sf.fourteen_polys(gw, h, t, t * 0.18), h


def draw_segments(draw, polys, names, h, color, dx=0, dy=0):
    for n in names:
        p = sf.shear(polys[n], h, SLANT)
        draw.polygon(scale(p, dx, dy), fill=rgba(color))


def glyph_sprite(size, geom_fn, names, color):
    polys, h = geom_fn(size)
    im = Image.new("RGBA", (size["w"] * S, size["h"] * S), (0, 0, 0, 0))
    draw_segments(ImageDraw.Draw(im), polys, names, h, color)
    return down(im, (size["w"], size["h"]))


def seven(ch):
    return list(sf.SEVEN[ch])


def fourteen(ch):
    return sf.FOURTEEN[ch]


def text14(draw, text, x, y, size, color, adv=None):
    polys, h = fourteen_geom(size)
    adv = adv or size["w"] + 2
    for i, ch in enumerate(text):
        draw_segments(draw, polys, fourteen(ch), h, color, x + i * adv, y)


# ---- background pieces ----------------------------------------------------
def polar(r, deg):
    a = math.radians(deg)
    return C + r * math.sin(a), C - r * math.cos(a)


def radial_fields(n):
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = n / 2 - 0.5
    dx, dy = (xx - cx) / S, (yy - cx) / S
    r = np.hypot(dx, dy)
    ang = (np.degrees(np.arctan2(dx, -dy)) + 360) % 360  # 0 = 12 o'clock, clockwise
    return r, ang


def bezel_and_dial(n):
    r, ang = radial_fields(n)
    img = np.zeros((n, n, 3), np.float32)

    # dial: black with fine concentric grooves
    dial = r < 188
    groove = (np.floor(r / 3) % 2 == 0)
    img[dial] = 8
    img[dial & groove] = 12

    # chapter ring
    ch = (r >= 188) & (r < 207)
    img[ch] = 15

    # bezel: brushed gunmetal lit from the upper left, bevelled edges
    bz = (r >= 207) & (r <= 233.5)
    light = np.cos(np.radians(ang - 315))
    base = 40 + 16 * light
    bevel = np.clip(1 - np.abs(r - 220) / 13, 0, 1) ** 0.6
    val = base * (0.55 + 0.45 * bevel)
    for c, tint in enumerate((1.0, 1.03, 1.08)):
        img[..., c][bz] = (val * tint)[bz]
    # bright inner and outer lips
    img[(r >= 207) & (r < 208.3)] = 70
    img[(r >= 231.6) & (r <= 233.5)] = 62
    img[(r > 233.5)] = 0
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def chamfer_rect(x, y, w, h, c):
    return [(x + c, y), (x + w - c, y), (x + w, y + c), (x + w, y + h - c),
            (x + w - c, y + h), (x + c, y + h), (x, y + h - c), (x, y + c)]


def draw_window(d, x, y, w, h, aod=False):
    if aod:
        d.polygon(scale(chamfer_rect(x, y, w, h, 7)), outline=rgba((44, 48, 52)), width=2 * S)
        return
    d.polygon(scale(chamfer_rect(x - 4, y - 4, w + 8, h + 8, 10)), fill=rgba((74, 79, 85)))
    d.polygon(scale(chamfer_rect(x - 2, y - 2, w + 4, h + 4, 8)), fill=rgba((30, 33, 37)))
    d.polygon(scale(chamfer_rect(x, y, w, h, 7)), fill=rgba(LCD_BG))
    # faint top highlight on the frame
    d.line(scale([(x + 10, y - 4), (x + w - 10, y - 4)]), fill=rgba((120, 126, 132)), width=S)


def draw_bolt(d, cx, cy, rr=8.5):
    d.ellipse(scale([(cx - rr - 1.5, cy - rr - 1.5), (cx + rr + 1.5, cy + rr + 1.5)]), fill=rgba((16, 17, 19)))
    d.ellipse(scale([(cx - rr, cy - rr), (cx + rr, cy + rr)]), fill=rgba((112, 118, 125)))
    d.ellipse(scale([(cx - rr + 1.5, cy - rr + 1.5), (cx + rr - 2.5, cy + rr - 2.5)]), fill=rgba((150, 156, 162)))
    hexr = rr * 0.52
    pts = [(cx + hexr * math.cos(math.radians(30 + 60 * i)), cy + hexr * math.sin(math.radians(30 + 60 * i))) for i in range(6)]
    d.polygon(scale(pts), fill=rgba((34, 36, 40)))


def arc_text(canvas, text, radius, center_deg, size, color, bottom=False, spacing=1.0):
    font = ImageFont.truetype(FONT_BOLD, size * S)
    widths = [font.getlength(ch) / S * spacing for ch in text]
    total = sum(widths)
    span = math.degrees(total / radius)
    acc = 0
    for ch, w in zip(text, widths):
        mid = acc + w / 2
        acc += w
        off = math.degrees(mid / radius) - span / 2
        phi = center_deg - off if bottom else center_deg + off
        tile = Image.new("RGBA", (size * 2 * S, size * 2 * S), (0, 0, 0, 0))
        td = ImageDraw.Draw(tile)
        td.text((size * S, size * S), ch, font=font, fill=rgba(color), anchor="mm")
        rot = -(phi - 180) if bottom else -phi
        tile = tile.rotate(rot, resample=Image.BICUBIC)
        px, py = polar(radius, phi)
        canvas.alpha_composite(tile, (int(px * S - tile.width / 2), int(py * S - tile.height / 2)))


def build_bg():
    n = SCREEN * S
    im = bezel_and_dial(n)
    d = ImageDraw.Draw(im)

    # knurled grooves on the bezel's outer edge
    for i in range(90):
        a = i * 4
        d.line(scale([polar(226, a), polar(232, a)]), fill=rgba((20, 22, 24)), width=int(1.4 * S))

    for a in (45, 135, 225, 315):
        draw_bolt(d, *polar(219.5, a))

    arc_text(im, "RAMPART", 219, 0, 12, (196, 201, 206), spacing=1.25)
    arc_text(im, "WORLD TIME", 219, 180, 10, (150, 156, 162), bottom=True, spacing=1.2)
    arc_text(im, "HEART", 219, 270, 9, (120, 126, 132), spacing=1.2)
    arc_text(im, "STEPS", 219, 90, 9, (120, 126, 132), spacing=1.2)

    # minute track
    for m in range(60):
        a = m * 6
        if m == 0:
            d.polygon(scale([polar(206, -2.2), polar(206, 2.2), polar(191, 0)]), fill=rgba(ACCENT))
        elif m % 5 == 0:
            d.line(scale([polar(191, a), polar(206, a)]), fill=rgba((214, 220, 214)), width=int(3 * S))
        else:
            d.line(scale([polar(197, a), polar(205, a)]), fill=rgba((112, 118, 124)), width=int(1.4 * S))
    d.ellipse(scale([(C - 188, C - 188), (C + 188, C + 188)]), outline=rgba((42, 45, 49)), width=S)

    # faint crosshair on the dial
    for a in (0, 90, 180, 270):
        d.line(scale([polar(20, a), polar(160, a)]), fill=rgba((17, 18, 20)), width=S)

    # hour indices
    r0, r1 = INDEX_R
    for hr in INDEX_HOURS:
        a = hr * 30
        def pt(r, off):
            x, y = polar(r, a)
            nx, ny = math.cos(math.radians(a)), math.sin(math.radians(a))
            return x + nx * off, y + ny * off
        outer = [pt(r0, -5), pt(r1, -8), pt(r1, 8), pt(r0, 5)]
        inner = [pt(r0 + 2.5, -3), pt(r1 - 2.5, -5.5), pt(r1 - 2.5, 5.5), pt(r0 + 2.5, 3)]
        d.polygon(scale(outer), fill=rgba((96, 101, 107)))
        d.polygon(scale(inner), fill=rgba(LUME))
    # twelve: twin lume blocks + orange arrow
    for off in (-4.2, 4.2):
        a = off
        blk = [polar(166, a - 1.6), polar(188, a - 2.1), polar(188, a + 2.1), polar(166, a + 1.6)]
        d.polygon(scale(blk), fill=rgba((96, 101, 107)))
        blk2 = [polar(168, a - 1.0), polar(186, a - 1.4), polar(186, a + 1.4), polar(168, a + 1.0)]
        d.polygon(scale(blk2), fill=rgba(LUME))

    # LCD windows
    win = LAYOUT["win"]
    for k in ("top", "t2", "hr", "steps"):
        draw_window(d, *win[k])

    # ghost segments
    lg_p, lg_h = seven_geom(LG)
    sm_p, sm_h = seven_geom(SM)
    ch_p, ch_h = fourteen_geom(CH)
    for x, y in LAYOUT["weekday"] + LAYOUT["t2_city"]:
        draw_segments(d, ch_p, sf.ALL14, ch_h, GHOST, x, y)
    for x, y in LAYOUT["day"] + LAYOUT["hr"] + LAYOUT["steps"]:
        draw_segments(d, sm_p, "abcdefg", sm_h, GHOST, x, y)
    for x, y in LAYOUT["t2_digits"]:
        draw_segments(d, lg_p, "abcdefg", lg_h, GHOST, x, y)
    cx, cy = LAYOUT["t2_colon"]
    for yy in (cy + 13, cy + 31):
        d.rectangle(scale([(cx + 3, yy), (cx + 8, yy + 5)]), fill=rgba(GHOST))
    ax, ay = LAYOUT["t2_ampm"]
    text14(d, "PM", ax, ay, {"w": 15, "h": AMPM["h"]}, GHOST, adv=18)
    bx, by = LAYOUT["batt"]
    for i in range(10):
        d.rectangle(scale([(bx + i * 13, by), (bx + i * 13 + 10, by + BATT["h"] - 1)]), fill=rgba(GHOST))
    d.rectangle(scale([(bx + 130, by + 2), (bx + 132, by + BATT["h"] - 3)]), fill=rgba(LABEL))

    # static LCD content: the orange T2 tag
    tx, ty = LAYOUT["t2_tag"]
    text14(d, "T2", tx, ty, CH, ACCENT, adv=18)

    # labels printed on the dial
    font = ImageFont.truetype(FONT_BOLD, 10 * S)
    for label, (wx, wy, ww, wh) in (("BPM", LAYOUT["win"]["hr"]), ("STEPS TODAY", LAYOUT["win"]["steps"])):
        d.text(((wx + ww / 2) * S, (wy + wh + 13) * S), label, font=font, fill=rgba(LABEL), anchor="mm")

    # heart icon
    hx, hy, hw, hh = LAYOUT["heart_icon"]
    r = hw / 4
    d.ellipse(scale([(hx, hy), (hx + 2 * r + 1, hy + 2 * r + 1)]), fill=rgba(HEART))
    d.ellipse(scale([(hx + 2 * r - 1, hy), (hx + 4 * r, hy + 2 * r + 1)]), fill=rgba(HEART))
    d.polygon(scale([(hx + 0.3, hy + r + 1.5), (hx + hw - 0.3, hy + r + 1.5), (hx + hw / 2, hy + hh)]), fill=rgba(HEART))

    bg = down(im, (SCREEN, SCREEN))
    return round_mask(bg)


def round_mask(img):
    mask = Image.new("L", (SCREEN * S, SCREEN * S), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, SCREEN * S - 1, SCREEN * S - 1], fill=255)
    mask = down(mask, (SCREEN, SCREEN))
    out = Image.new("RGBA", img.size, (0, 0, 0, 255))
    out.paste(img, (0, 0), mask)
    return out


def build_aod_bg():
    n = SCREEN * S
    im = Image.new("RGBA", (n, n), (0, 0, 0, 255))
    d = ImageDraw.Draw(im)
    for h in range(12):
        a = h * 30
        col = ACCENT if h == 0 else (92, 96, 100)
        wdt = 4 if h % 3 == 0 else 2.5
        d.line(scale([polar(192, a), polar(210, a)]), fill=rgba(col), width=int(wdt * S))
    draw_window(d, *LAYOUT["win"]["t2"], aod=True)
    tx, ty = LAYOUT["t2_tag"]
    text14(d, "T2", tx, ty, CH, (150, 64, 22), adv=18)
    return round_mask(down(im, (SCREEN, SCREEN)))


# ---- hands ----------------------------------------------------------------
HOUR_OUTER = [(-6, 18), (-6, 6), (-10, -10), (-12, -30), (-12, -86), (0, -107), (12, -86), (12, -30), (10, -10), (6, 6), (6, 18)]
HOUR_LUME = [(-7, -34), (-7, -84), (0, -97), (7, -84), (7, -34)]
MIN_OUTER = [(-5, 18), (-5, 6), (-8, -12), (-9, -40), (-9, -140), (0, -161), (9, -140), (9, -40), (8, -12), (5, 6), (5, 18)]
MIN_LUME = [(-5, -44), (-5, -138), (0, -150), (5, -138), (5, -44)]


def hand_image(spec, outer, lume, aod=False):
    w, h, px, py = spec["w"], spec["h"], spec["px"], spec["py"]
    im = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    o = scale(outer, px, py)
    if aod:
        d.polygon(o, fill=rgba((0, 0, 0)), outline=rgba((170, 176, 172)))
        d.line(o + [o[0]], fill=rgba((170, 176, 172)), width=int(2 * S), joint="curve")
        d.polygon(scale(lume, px, py), fill=rgba((60, 66, 62)))
    else:
        d.polygon(o, fill=rgba(STEEL_DARK))
        # inset steel body: shrink outline by ~1.5 px
        inset = [(x * 0.78, y * 0.985) for x, y in outer]
        d.polygon(scale(inset, px, py), fill=rgba(STEEL))
        # left half slightly darker for a faceted look
        left = [(x, y) for x, y in inset if x <= 0]
        left = [(0, max(y for _, y in inset))] + left + [(0, min(y for _, y in inset))]
        d.polygon(scale(left, px, py), fill=rgba((150, 156, 162)))
        d.polygon(scale(lume, px, py), fill=rgba(LUME))
    return down(im, (w, h))


def second_hand(spec, aod=False):
    w, h, px, py = spec["w"], spec["h"], spec["px"], spec["py"]
    im = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(scale([(-1.6, 34), (-1.6, -150), (-1.0, -180), (1.0, -180), (1.6, -150), (1.6, 34)], px, py), fill=rgba(ACCENT))
    d.rectangle(scale([(-2.6, -176), (2.6, -158)], px, py), fill=rgba(LUME))
    d.ellipse(scale([(-6.5, 23.5), (6.5, 36.5)], px, py), fill=rgba(ACCENT))
    d.ellipse(scale([(-2.5, 27.5), (2.5, 32.5)], px, py), fill=rgba((20, 20, 20)))
    d.ellipse(scale([(-5.5, -5.5), (5.5, 5.5)], px, py), fill=rgba(ACCENT))
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


# ---- main ----------------------------------------------------------------
def save(img, name):
    img.save(os.path.join(OUT, name), optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    save(build_bg(), "bg.png")
    save(build_aod_bg(), "aod_bg.png")

    for dname, color in (("", LCD_ON), ("a", LCD_DIM)):
        for ch in "0123456789":
            save(glyph_sprite(LG, seven_geom, seven(ch), color), f"lg{dname}_{ch}.png")
        colon = Image.new("RGBA", (COLON["w"] * S, COLON["h"] * S), (0, 0, 0, 0))
        cd = ImageDraw.Draw(colon)
        for yy in (13, 31):
            cd.rectangle(scale([(3, yy), (8, yy + 5)]), fill=rgba(color))
        save(down(colon, (COLON["w"], COLON["h"])), f"colon{dname}.png")
        for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789":
            save(glyph_sprite(CH, fourteen_geom, fourteen(ch), color), f"ch{dname}_{ch}.png")
        for tag in ("AM", "PM"):
            im = Image.new("RGBA", (AMPM["w"] * S, AMPM["h"] * S), (0, 0, 0, 0))
            text14(ImageDraw.Draw(im), tag, 0, 0, {"w": 15, "h": AMPM["h"]}, color, adv=18)
            save(down(im, (AMPM["w"], AMPM["h"])), f"{tag.lower()}{dname}.png")

    for ch in "0123456789-":
        name = "dash" if ch == "-" else ch
        save(glyph_sprite(SM, seven_geom, seven(ch), LCD_ON), f"sm_{name}.png")

    for n in range(11):
        im = Image.new("RGBA", (BATT["w"] * S, BATT["h"] * S), (0, 0, 0, 0))
        bd = ImageDraw.Draw(im)
        col = ACCENT if n <= 2 else LCD_ON
        for i in range(n):
            bd.rectangle(scale([(i * 13, 0), (i * 13 + 10, BATT["h"] - 1)]), fill=rgba(col))
        save(down(im, (BATT["w"], BATT["h"])), f"batt_{n}.png")

    hands = LAYOUT["hands"]
    save(hand_image(hands["hour"], HOUR_OUTER, HOUR_LUME), "hand_h.png")
    save(hand_image(hands["minute"], MIN_OUTER, MIN_LUME), "hand_m.png")
    save(second_hand(hands["second"]), "hand_s.png")
    save(hand_image(hands["hour"], HOUR_OUTER, HOUR_LUME, aod=True), "hand_h_aod.png")
    save(hand_image(hands["minute"], MIN_OUTER, MIN_LUME, aod=True), "hand_m_aod.png")
    save(hub(LAYOUT["hub"]["size"]), "hub.png")
    save(hub(LAYOUT["hub"]["size"], aod=True), "hub_aod.png")

    save(Image.new("RGBA", (4, 4), (0, 0, 0, 0)), "blank.png")
    x, y, w, h = LAYOUT["t2_hit"]
    save(Image.new("RGBA", (w, h), (0, 0, 0, 0)), "t2_hit.png")

    js = os.path.join(ROOT, "app", "watchface", "layout.js")
    with open(js, "w") as f:
        f.write("// GENERATED by tools/generate_assets.py from tools/layout.py - do not edit by hand.\n")
        f.write("export const LAYOUT = " + json.dumps(LAYOUT, indent=2) + "\n")
    print("assets written to", OUT)


if __name__ == "__main__":
    main()
