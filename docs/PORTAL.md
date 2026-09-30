# amazfitwatchfaces.com upload checklist

**Device:** Amazfit Active 2 (Round). File: run `npm run release` and upload `release/Rampart_GMT_v<version>.zip`.
**Device:** Amazfit Balance, as a separate upload in the Balance section. File: run `npm run release:balance` and upload `release/Rampart_GMT_Balance_v<version>.zip`.
**Note:** The catalog doesn't take the `.zab` bundle; this is the watch-face package inside it (app.json + assets at the root), the same format community editors export.
**Preview:** `docs/preview.gif` for Active 2 and `docs/balance/preview.gif` for Balance (animated, which the rules prefer). `preview_card.png` next to each is a static backup.

**Name:** Rampart GMT Ana-Digi

**Tags:** analog, digital, hybrid, ana-digi, chronograph, subdials, gmt, dual time, world time, second time zone, 45 cities, 24 hour bezel, utc, heart rate, steps, battery, date, shortcuts, tap to open, sport, tactical, outdoor, lcd, black, orange, teal, dark, aod, open source

**Description:**

Rampart GMT is an ana-digi chronograph-style face built around a second time zone.

- Analog hands for local time, with a sweeping orange second hand
- GMT hand on a two-tone 24-hour bezel showing T2
- T2 LCD with city code, time and AM/PM. Tap to step through 45 built-in cities covering every time zone (automatic daylight-saving time); double tap to open World Clock.
- Top subdial: weekday, date, battery ring and %
- Left subdial: heart-rate gauge and reading
- Bottom subdial: steps gauge (0–10K) and steps today
- Tap shortcuts: date → Calendar, heart rate → Heart Rate, steps → Activity, T2 double tap → World Clock, centre → Alarms, with orange press feedback
- Always-on display: outlined hands, GMT hand and a dimmed T2 display
- Original artwork. Free and open source (MIT): github.com/soumiks17/rampart-watchface

v2.3.1: same as 2.3.0, re-released with a higher version number so watches replace older installs.
v2.3.0: T2 steps through 45 built-in cities covering every time zone; double tap opens World Clock.
v2.2.1: fix - your World Clock cities now load on the face (the watch delivers them a moment after the face starts).
v2.2.0: T2 shows only your World Clock cities; tap = next city, double tap = open World Clock.
v2.1.1: fix - tapping T2 now opens World Clock on current firmware.
v2.1.0: tap the T2 display to open World Clock; cities you add there appear on the face automatically.
v2.0.0: new chronograph layout with GMT hand. T2 now works without any world clocks set up on the watch.
