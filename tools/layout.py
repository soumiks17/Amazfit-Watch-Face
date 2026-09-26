"""Single source of truth for geometry.

generate_assets.py bakes the static parts of this into bg.png and writes the
whole dict to app/watchface/layout.js, so the watch face places its live
sprites exactly where the ghost segments were printed. render_preview.py
reads the same dict, so the preview can't drift from the device either.
"""

SCREEN = 466
C = SCREEN // 2  # 233

# Sprite sizes (w, h). Glyph widths include the italic slant.
LG = {"w": 26, "h": 38}      # T2 time digits (LCD)
MD = {"w": 21, "h": 30}      # day of month
SM = {"w": 14, "h": 20}      # HR, steps, battery %
CH = {"w": 13, "h": 16}      # 14-seg letters (weekday, city code)
AMPM = {"w": 28, "h": 12}
COLON = {"w": 9, "h": 38}

SUB_R = 56                   # subdial radius
SUBDIALS = {
    "date": [C, 125],        # top: weekday, day, battery ring
    "hr": [125, C],          # left: heart-rate gauge
    "steps": [C, 341],       # bottom: steps-goal gauge
}

LAYOUT = {
    "screen": SCREEN,
    "center": C,
    "sizes": {"lg": LG, "md": MD, "sm": SM, "ch": CH, "ampm": AMPM, "colon": COLON},
    "sub_r": SUB_R,
    "subdials": SUBDIALS,
    # T2 LCD window at 3 o'clock: x, y, w, h
    "lcd": [292, 196, 128, 76],
    "t2_tag": [300, 204],
    "t2_city": [[329, 204], [343, 204], [357, 204]],
    "t2_ampm": [384, 206],
    "t2_digits": [[298, 226], [323, 226], [358, 226], [383, 226]],
    "t2_colon": [349, 226],
    # Top subdial: weekday, day, battery %
    "weekday": [[212, 84], [226, 84], [240, 84]],
    "day": [[212, 104], [233, 104]],
    "batt_pct": [[211, 142], [224, 142], [237, 142]],
    "batt_arc": [C - 54, 125 - 54, 108, 108],   # ring overlay box (r 49.5-53.5)
    # Left subdial: heart rate digits
    "hr": [[104, 250], [118, 250], [132, 250]],
    # Bottom subdial: steps digits
    "steps": [[199, 358], [212, 358], [225, 358], [238, 358], [251, 358]],
    # Needles (rotating IMG): image size + pivot in the image
    "needle": {"w": 12, "h": 60, "px": 6, "py": 48},
    "gmt": {"w": 20, "h": 226, "px": 10, "py": 208},
    # Main hands
    "hands": {
        "hour": {"w": 26, "h": 132, "px": 13, "py": 110},
        "minute": {"w": 20, "h": 190, "px": 10, "py": 170},
        "second": {"w": 16, "h": 232, "px": 8, "py": 190},
    },
    "hub": {"size": 30},
    # Tap zones (x, y, w, h). Bigger than what they cover: a fingertip is
    # ~100 px on this 33 mm screen. Zones don't overlap.
    "zones": {
        "date": [178, 58, 110, 122],     # tap: Calendar
        "hr": [18, 174, 160, 118],       # tap: Heart Rate
        "center": [178, 180, 110, 106],  # tap: Alarms
        "lcd": [288, 186, 160, 106],     # tap: next city   hold: previous city
        "steps": [178, 286, 110, 122],   # tap: Activity
    },
}

# Hour indices; 12/3/6/9 are taken by the subdials and the LCD.
INDEX_HOURS = [1, 2, 4, 5, 7, 8, 10, 11]
INDEX_R = (168, 194)
