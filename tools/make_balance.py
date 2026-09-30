"""Build the Amazfit Balance (480 x 480) copy of the watch face.

    python tools/make_balance.py      (or: npm run balance)

Writes app-balance/, a second Zepp OS project identical to app/ except:
  - target 'balance' with the Amazfit Balance deviceSource ids, designWidth 480
  - every image redrawn for 480 px (same design, same supersampled drawing
    code, just a larger output size) and a matching layout.js
Also renders docs/balance/preview.gif (+ preview.png, preview_card.png,
preview_aod.png) for the Balance listing on amazfitwatchfaces.com.
The watch-face code (index.js, logic.js, app.js) is copied from app/ as is,
so the two versions can't drift apart: change app/, then re-run this.
"""
import json
import os
import shutil

import generate_assets as ga
import render_preview as rp

ROOT = ga.ROOT
SRC = os.path.join(ROOT, "app")
DST = os.path.join(ROOT, "app-balance")
TARGET = "balance"
SCREEN = 480
# Amazfit Balance (Zepp OS 4.0, API level 3.7): global + Mainland China ids,
# from the Zepp OS device list.
DEVICE_SOURCES = [8519936, 8519937, 8519939]


def main():
    os.makedirs(os.path.join(DST, "watchface"), exist_ok=True)
    for rel in ("app.js", os.path.join("watchface", "index.js"), os.path.join("watchface", "logic.js")):
        shutil.copyfile(os.path.join(SRC, rel), os.path.join(DST, rel))

    with open(os.path.join(SRC, "app.json")) as f:
        app = json.load(f)
    (src_target,) = app["targets"].values()
    app["targets"] = {
        TARGET: {
            "module": src_target["module"],
            "platforms": [{"name": TARGET, "deviceSource": d} for d in DEVICE_SOURCES],
            "designWidth": SCREEN,
        }
    }
    with open(os.path.join(DST, "app.json"), "w") as f:
        f.write(json.dumps(app, indent=2) + "\n")

    assets = os.path.join(DST, "assets", TARGET)
    os.makedirs(assets, exist_ok=True)

    ga.OUTK = SCREEN / ga.SCREEN
    ga.OUT = os.path.join(assets, "images")
    ga.JS_PATH = os.path.join(DST, "watchface", "layout.js")
    ga.main()

    # Previews for the Balance listing (docs/balance/preview.gif etc.) and the
    # face-picker icon, rendered from the Balance sprites and layout.
    with open(ga.JS_PATH) as f:
        layout = json.loads(f.read().split("export const LAYOUT = ", 1)[1])
    rp.configure(ga.OUT, layout, os.path.join(ROOT, "docs", "balance"))
    rp.main(icon_path=os.path.join(assets, "icon.png"), figures=False)
    print("Balance project written to", DST)


if __name__ == "__main__":
    main()
