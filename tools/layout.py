"""Single source of truth for geometry.

generate_assets.py bakes the static parts of this into bg.png and writes the
whole dict to app/watchface/layout.js, so the watch face places its live
sprites exactly where the ghost segments were printed. render_preview.py
reads the same dict, so the preview can't drift from the device either.
"""

SCREEN = 466
C = SCREEN // 2  # 233

# Sprite sizes (w, h). Glyph widths include the italic slant.
LG = {"w": 33, "h": 48}      # large 7-seg (T2 time)
SM = {"w": 18, "h": 28}      # small 7-seg (date, HR, steps)
CH = {"w": 16, "h": 20}      # 14-seg letters (weekday, city code)
AMPM = {"w": 34, "h": 16}
COLON = {"w": 12, "h": 48}
BATT = {"w": 133, "h": 8}

LAYOUT = {
    "screen": SCREEN,
    "center": C,
    "sizes": {"lg": LG, "sm": SM, "ch": CH, "ampm": AMPM, "colon": COLON, "batt": BATT},
    # LCD windows: x, y, w, h (chamfered rectangles in bg.png)
    "win": {
        "top": [160, 112, 146, 58],
        "t2": [146, 278, 174, 84],
        "hr": [48, 211, 106, 44],
        "steps": [312, 211, 106, 44],
    },
    # Top window: weekday + day of month + battery bar
    "weekday": [[170, 126], [188, 126], [206, 126]],
    "day": [[254, 118], [275, 118]],
    "batt": [170, 154],
    # Heart-rate window: three small digits, right-aligned
    "hr": [[82, 219], [102, 219], [122, 219]],
    "heart_icon": [58, 225, 18, 16],
    # Steps window: five small digits, right-aligned
    "steps": [[321, 219], [339, 219], [357, 219], [375, 219], [393, 219]],
    # T2 window: city code letters, AM/PM flag, HH:MM
    "t2_tag": [156, 284],
    "t2_city": [[198, 284], [216, 284], [234, 284]],
    "t2_ampm": [281, 286],
    "t2_digits": [[153, 308], [190, 308], [243, 308], [280, 308]],
    "t2_colon": [227, 308],
    # Hands: image size and pivot inside the image (posX/posY)
    "hands": {
        "hour": {"w": 26, "h": 132, "px": 13, "py": 110},
        "minute": {"w": 20, "h": 186, "px": 10, "py": 164},
        "second": {"w": 16, "h": 226, "px": 8, "py": 184},
    },
    "hub": {"size": 30},
    # Tap zones (x, y, w, h). Bigger than the windows they cover: a
    # fingertip is ~100 px on this 33 mm screen. Zones don't overlap.
    "zones": {
        "top": [120, 70, 226, 118],      # tap: Calendar
        "hr": [16, 188, 150, 76],        # tap: Heart Rate
        "steps": [300, 188, 150, 76],    # tap: Activity
        "center": [170, 192, 126, 72],   # tap: Alarms
        "t2": [120, 266, 226, 134],       # tap: next city   hold: World Clock
    },
}

# Hour indices (clock hours) that get a lume block; 3 and 9 are replaced by
# the HR / STEPS windows.
INDEX_HOURS = [1, 2, 4, 5, 6, 7, 8, 10, 11]
INDEX_R = (164, 188)
