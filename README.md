# Rampart GMT: an ana-digi chronograph face for the Amazfit Active 2 (Round)

![Rampart GMT preview](docs/preview.gif)

Rampart GMT is an open-source Zepp OS watch face: three subdials, a 24-hour GMT bezel and hand, and an LCD window for a **second time zone (T2)**.

| Element | Shows | Tap |
|---|---|---|
| Hands | Local time with a sweeping second hand | Centre: **Alarms** |
| Teal arrow + 24h bezel | T2 on a 24-hour scale (night half of the bezel is darker) | |
| Right LCD | T2: city code, HH:MM, AM/PM in 12-hour mode | **Tap:** next city · **Hold:** previous city |
| Top subdial | Weekday, day of month, battery ring + % (ring turns orange at 20% or less) | **Calendar** |
| Left subdial | Heart-rate gauge (40–200 bpm) + last reading, `--` until there is one | **Heart Rate** |
| Bottom subdial | Step-goal gauge (% of your goal) + steps today | **Activity** |

The always-on display keeps outlined hands, the GMT hand and a dimmed T2 window. Each tap zone is larger than what it covers, since fingertips are big on a 33 mm screen. While you press, it gets an orange ring or frame.

![Active and always-on](docs/preview_sheet.png)

![Tap zones](docs/tap_zones.png)

### T2 cities
Tapping the LCD steps through:
1. the **World Clock** cities set up on your watch (if any), then
2. 23 built-in cities, including their daylight-saving rules: HNL ANC LAX PHX DEN CHI NYC SAO **UTC** LON PAR ATH MOW DXB KHI BOM DAC BKK SIN HKG TYO SYD AKL.

Your choice is remembered. With nothing saved, T2 starts on your first watch world clock, or on UTC if there are none. The built-in DST rules (US, EU, Australia, NZ) are checked in the tests against the real time-zone database for 2025–2030.

**Target:** Amazfit Active 2 **Round**: 466×466, Zepp OS 4.x, API level 3.0+. It won't fit the Active 2 *Square* (390×450) without a new layout.

---

## Install (users)

- **From amazfitwatchfaces.com:** download it from the Rampart GMT page and install it with the AmazFaces app, or however the page describes.
- **From GitHub:** download the latest file from [Releases](../../releases), or build it yourself (below).

---

## Build from source (developers)

Requirements: [Node.js LTS](https://nodejs.org), Python 3.10+ (only needed to regenerate artwork), and the Zepp phone app with **Developer Mode** turned on.

```bash
npm install -g @zeppos/zeus-cli
git clone https://github.com/soumiks17/rampart-watchface.git
cd rampart-watchface
npm test            # logic + mocked-platform smoke tests
npm run build       # -> app/dist/*.zab
```

**On the simulator:** install the Zepp OS Simulator from the Zepp developer site, choose the Active 2 (Round), and run `npm run dev`.

**On your watch:**
1. In the Zepp app, open Profile → Settings → About and tap the Zepp logo 7 times to turn on Developer Mode.
2. `cd app && zeus login` (once).
3. `npm run preview` prints a QR code. Scan it from the Zepp app's Developer Mode → Scan.

### Regenerating the artwork
Everything visual is generated from code in `tools/`. No fonts or third-party images are baked in, except the bezel lettering, which uses DejaVu Sans Condensed Bold (a free license).

```bash
pip install -r requirements.txt
npm run assets      # rebuilds every PNG, app/watchface/layout.js, previews and icon
```

`tools/layout.py` is the single source of truth for positions. The generator bakes the static parts into `bg.png` and writes the same numbers to `app/watchface/layout.js`, so the live digits always land on their ghost segments.

## Project layout

```
app/                       Zepp OS project root (run zeus here)
  app.json                 target: active-2-round, 8 deviceSource ids, designWidth 466
  watchface/index.js       the only file that touches @zos/* APIs
  watchface/logic.js       pure display logic (tested under Node)
  watchface/layout.js      GENERATED geometry
  assets/active-2-round/   icon + images (GENERATED)
tools/                     Python asset generator + preview renderer
test/                      node:test suites (kept outside app/: zeus bundles every .js under app/)
docs/                      previews for README and the portal listing
```

## Notes and known limits

- Built on the modern `@zos/*` module API. The old `hmUI` / `hmSensor` globals don't exist on this runtime.
- Heart rate uses `HeartRate.getLast()`. On a real watch, `getCurrent()` reads 0 unless a continuous measurement is running. Turn on heart-rate monitoring in the watch's health settings for regular updates.
- `WorldClock` (API 3.0) is created, read and released on every refresh. A sensor created once at startup can hold an empty snapshot, which is how v1 got stuck on UTC. Both the current (`getCount`/`getInfo`) and legacy (`init`/`getWorldClock*`) method names are tried.
- Subdial needles and the GMT hand are rotating `IMG` widgets (`center_x/center_y` + `angle`). The main hands use `TIME_POINTER`.
- Tap zones are transparent `BUTTON` widgets (the pattern community Zepp OS faces use). App shortcuts use `launchApp({ appId: SYSTEM_APP_*, native: true })` from `@zos/router` (API 3.0). To change what a zone opens, edit `TAP_ACTIONS` at the top of `app/watchface/index.js`.
- If a firmware refuses an app jump, that tap does nothing rather than crashing the face. Issues and PRs are welcome.

## Credits

- Design and code: Soumik Sen ([@soumiks17](https://github.com/soumiks17)).
- Runtime findings for the Active 2 (the `@zos` API mapping, `getLast()` vs `getCurrent()`, the deviceSource list) come from [duynnguyen22/ZeppOS_mywatchface](https://github.com/duynnguyen22/ZeppOS_mywatchface).
- TIME_POINTER usage follows [zepp-health/zeppos-samples](https://github.com/zepp-health/zeppos-samples).

## License

[MIT](LICENSE). This covers the code and the generated artwork. Fork it, remix it, and ship your own variants.
