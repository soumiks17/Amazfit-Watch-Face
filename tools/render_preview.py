"""Render off-device previews from the real sprites and layout.

    python tools/render_preview.py

Writes docs/preview.png, docs/preview_aod.png, docs/preview.gif (animated,
for the amazfitwatchfaces.com upload) and the app icon. The sprite choice
logic mirrors app/watchface/index.js.
"""
import os

from PIL import Image, ImageDraw, ImageFont

from layout import LAYOUT, SCREEN, C

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
IMG = os.path.join(ROOT, "app", "assets", "active-2-round", "images")
DOCS = os.path.join(ROOT, "docs")
WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
_cache = {}


def sprite(name):
    if name not in _cache:
        _cache[name] = Image.open(os.path.join(IMG, name)).convert("RGBA")
    return _cache[name]


def put(canvas, name, xy):
    canvas.alpha_composite(sprite(name), (int(xy[0]), int(xy[1])))


def right_aligned(value, slots, blank_leading=True):
    """Digits for `slots` positions, right-aligned; None = leave blank."""
    s = str(value)[-slots:]
    return [None] * (slots - len(s)) + list(s)


def hand(canvas, name, spec, angle):
    im = sprite(name)
    pad = max(im.width, im.height) * 2
    big = Image.new("RGBA", (pad, pad), (0, 0, 0, 0))
    big.alpha_composite(im, (pad // 2 - spec["px"], pad // 2 - spec["py"]))
    big = big.rotate(-angle, resample=Image.BICUBIC, center=(pad // 2, pad // 2))
    canvas.alpha_composite(big, (C - pad // 2, C - pad // 2))


def render(state, aod=False):
    L = LAYOUT
    cv = sprite("aod_bg.png" if aod else "bg.png").copy()
    sfx = "a" if aod else ""

    if not aod:
        wd = WEEKDAYS[state["weekday"] - 1]
        for (x, y), ch in zip(L["weekday"], wd):
            put(cv, f"ch_{ch}.png", (x, y))
        for (x, y), ch in zip(L["day"], f"{state['day']:02d}"):
            put(cv, f"sm_{ch}.png", (x, y))
        put(cv, f"batt_{min(10, (state['battery'] + 9) // 10)}.png", L["batt"])
        hr = state["hr"]
        digits = ["dash", "dash"] if hr is None else right_aligned(hr, 3)
        if hr is None:
            digits = [None, "dash", "dash"]
        for (x, y), ch in zip(L["hr"], digits):
            if ch is not None:
                put(cv, f"sm_{ch}.png", (x, y))
        for (x, y), ch in zip(L["steps"], right_aligned(state["steps"], 5)):
            if ch is not None:
                put(cv, f"sm_{ch}.png", (x, y))

    # T2
    h, m = state["t2"]
    ampm = None
    if state["h12"]:
        ampm = "am" if h < 12 else "pm"
        h = h % 12 or 12
        hs = f"{h:2d}"
    else:
        hs = f"{h:02d}"
    for (x, y), ch in zip(L["t2_digits"], hs + f"{m:02d}"):
        if ch != " ":
            put(cv, f"lg{sfx}_{ch}.png", (x, y))
    put(cv, f"colon{sfx}.png", L["t2_colon"])
    for (x, y), ch in zip(L["t2_city"], state["city"][:3]):
        put(cv, f"ch{sfx}_{ch}.png", (x, y))
    if ampm:
        put(cv, f"{ampm}{sfx}.png", L["t2_ampm"])

    # hands
    hh, mm, ss = state["time"]
    hands = L["hands"]
    ha = (hh % 12) * 30 + mm * 0.5
    ma = mm * 6 + ss * 0.1
    if aod:
        hand(cv, "hand_h_aod.png", hands["hour"], ha)
        hand(cv, "hand_m_aod.png", hands["minute"], ma)
        hs_ = L["hub"]["size"]
        put(cv, "hub_aod.png", (C - hs_ // 2, C - hs_ // 2))
    else:
        hand(cv, "hand_h.png", hands["hour"], ha)
        hand(cv, "hand_m.png", hands["minute"], ma)
        hand(cv, "hand_s.png", hands["second"], ss * 6)
        hs_ = L["hub"]["size"]
        put(cv, "hub.png", (C - hs_ // 2, C - hs_ // 2))
    return cv


def on_card(face, pad=24, bg=(18, 19, 21)):
    card = Image.new("RGBA", (SCREEN + 2 * pad, SCREEN + 2 * pad), bg + (255,))
    mask = Image.new("L", (SCREEN * 4, SCREEN * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, SCREEN * 4 - 1, SCREEN * 4 - 1], fill=255)
    mask = mask.resize((SCREEN, SCREEN), Image.LANCZOS)
    card.paste(face, (pad, pad), mask)
    return card


TAP_LABELS = {
    "top": ["TAP: CALENDAR"],
    "hr": ["TAP:", "HEART RATE"],
    "steps": ["TAP:", "ACTIVITY"],
    "center": ["TAP: ALARMS"],
    "t2": ["TAP: NEXT CITY", "HOLD: WORLD CLOCK"],
}


def tap_map(face):
    """README figure: the face with its tap zones, plus one pressed state."""
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf", 13)
    dim = Image.new("RGBA", face.size, (0, 0, 0, 150))
    left = face.copy()
    left.alpha_composite(dim)
    ov = Image.new("RGBA", face.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for name, (x, y, w, h) in LAYOUT["zones"].items():
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=(255, 98, 28, 40), outline=(255, 98, 28, 255), width=2)
        lines = TAP_LABELS[name]
        for i, line in enumerate(lines):
            yy = y + h / 2 + (i - (len(lines) - 1) / 2) * 16
            d.text((x + w / 2, yy), line, font=font, fill=(255, 255, 255, 255), anchor="mm", stroke_width=3, stroke_fill=(0, 0, 0, 255))
    left.alpha_composite(ov)
    pressed = face.copy()
    x, y, w, h = LAYOUT["zones"]["hr"]
    pressed.alpha_composite(sprite("press_hr.png"), (x, y))
    sheet = Image.new("RGB", (2 * (SCREEN + 48), SCREEN + 90), (18, 19, 21))
    sheet.paste(on_card(left).convert("RGB"), (0, 0))
    sheet.paste(on_card(pressed).convert("RGB"), (SCREEN + 48, 0))
    dd = ImageDraw.Draw(sheet)
    f2 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf", 20)
    dd.text(((SCREEN + 48) // 2, SCREEN + 60), "TAP ZONES", fill=(180, 186, 190), font=f2, anchor="mm")
    dd.text((SCREEN + 48 + (SCREEN + 48) // 2, SCREEN + 60), "PRESSED (HR)", fill=(180, 186, 190), font=f2, anchor="mm")
    sheet.save(os.path.join(DOCS, "tap_zones.png"))


BASE = dict(weekday=6, day=26, battery=78, hr=72, steps=8432, city="NYC",
            t2=(11, 25), h12=True, time=(10, 10, 32))


def main():
    os.makedirs(DOCS, exist_ok=True)
    face = render(BASE)
    face.convert("RGB").save(os.path.join(DOCS, "preview.png"))
    render(BASE, aod=True).convert("RGB").save(os.path.join(DOCS, "preview_aod.png"))
    on_card(face).convert("RGB").save(os.path.join(DOCS, "preview_card.png"))

    # app icon shown in the watch's face picker
    icon = on_card(face, pad=0).resize((248, 248), Image.LANCZOS)
    icon.save(os.path.join(ROOT, "app", "assets", "active-2-round", "icon.png"))

    # animated preview: second hand sweeps while T2 cycles world clocks
    cities = [("NYC", -1), ("LON", 4), ("TYO", 13), ("UTC", 4)]
    frames = []
    for i in range(40):
        sec = (32 + i) % 60
        city, off = cities[(i // 10) % 4]
        local_h, local_m = 10, 10 + (32 + i) // 60
        th = (local_h + 1 + off) % 24 if city != "NYC" else 11
        st = dict(BASE, time=(local_h, local_m, sec), city=city, t2=(th, 25), hr=72 + (i // 13), steps=8432 + i * 3)
        frames.append(on_card(render(st)).convert("P", palette=Image.ADAPTIVE, colors=255))
    frames[0].save(os.path.join(DOCS, "preview.gif"), save_all=True, append_images=frames[1:], duration=250, loop=0, optimize=True)

    # side-by-side sheet for the README
    sheet = Image.new("RGB", (2 * (SCREEN + 48), SCREEN + 90), (18, 19, 21))
    sheet.paste(on_card(face).convert("RGB"), (0, 0))
    aod = render(BASE, aod=True)
    sheet.paste(on_card(aod).convert("RGB"), (SCREEN + 48, 0))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf", 20)
    d.text(((SCREEN + 48) // 2, SCREEN + 60), "ACTIVE", fill=(180, 186, 190), font=font, anchor="mm")
    d.text((SCREEN + 48 + (SCREEN + 48) // 2, SCREEN + 60), "ALWAYS-ON", fill=(180, 186, 190), font=font, anchor="mm")
    sheet.save(os.path.join(DOCS, "preview_sheet.png"))
    tap_map(face)
    print("previews written to", DOCS)


if __name__ == "__main__":
    main()
