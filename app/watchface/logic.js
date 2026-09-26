// Pure display logic - no @zos imports, so it runs under plain Node for the
// tests in /test. index.js is the only file that touches the platform.

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
export const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

// ---- digits -----------------------------------------------------------------
// Right-align a non-negative integer into `slots` positions. Empty leading
// positions are null (the ghost segments printed in bg.png show through).
export function digitsRight(value, slots) {
  const n = Math.max(0, Math.floor(value))
  let s = String(n)
  if (s.length > slots) s = s.slice(-slots)
  const out = []
  for (let i = 0; i < slots - s.length; i++) out.push(null)
  for (let i = 0; i < s.length; i++) out.push(s[i])
  return out
}

// Heart rate: null / 0 means "no reading yet" and shows as  --
export function hrDigits(hr) {
  if (typeof hr !== 'number' || !(hr > 0)) return [null, 'dash', 'dash']
  return digitsRight(Math.min(hr, 999), 3)
}

export function stepDigits(steps) {
  if (typeof steps !== 'number' || !(steps >= 0)) return [null, null, null, null, '0']
  return digitsRight(Math.min(steps, 99999), 5)
}

export function batteryFrame(pct) {
  if (typeof pct !== 'number' || !isFinite(pct)) return 0
  return Math.max(0, Math.min(10, Math.ceil(pct / 10)))
}

export function pad2(n) {
  return n < 10 ? '0' + n : String(n)
}

// ---- gauges -------------------------------------------------------------------
// Map value in [min, max] onto a 270-degree dial: -135 (min) .. +135 (max),
// 0 = straight up. Returned in 0..359 because that's what the IMG angle wants.
export function gaugeAngle(value, min, max) {
  let t = typeof value === 'number' && isFinite(value) ? (value - min) / (max - min) : 0
  t = Math.max(0, Math.min(1, t))
  return Math.round((-135 + 270 * t + 360) % 360)
}

// Angle of a 24-hour hand (0 = midnight at the top).
export function gmtAngle(h, m) {
  return Math.round(((h * 60 + m) / 1440) * 360) % 360
}

// ---- time zones -------------------------------------------------------------------
// Hours/minutes of a UTC timestamp (ms), shifted by `offsetMin` minutes.
export function hmAt(utcMs, offsetMin) {
  const total = Math.floor(utcMs / 60000) + (offsetMin || 0)
  const day = ((total % 1440) + 1440) % 1440
  return { h: Math.floor(day / 60), m: day % 60 }
}

function sundayOfMonth(year, month, n) {
  // n >= 1: nth Sunday; n = -1: last Sunday. month is 0-based.
  if (n > 0) {
    const wd = new Date(Date.UTC(year, month, 1)).getUTCDay()
    return 1 + ((7 - wd) % 7) + 7 * (n - 1)
  }
  const last = new Date(Date.UTC(year, month + 1, 0))
  return last.getUTCDate() - last.getUTCDay()
}

// Is daylight saving in force at utcMs for a zone with standard offset
// `off` (minutes) following `rule`?
export function dstActive(rule, utcMs, off) {
  if (!rule) return false
  const y = new Date(utcMs).getUTCFullYear()
  const at = (month, n, hour) => Date.UTC(y, month, sundayOfMonth(y, month, n), hour) - off * 60000
  if (rule === 'US') return utcMs >= at(2, 2, 2) && utcMs < at(10, 1, 1)
  if (rule === 'EU') {
    const start = Date.UTC(y, 2, sundayOfMonth(y, 2, -1), 1)
    const end = Date.UTC(y, 9, sundayOfMonth(y, 9, -1), 1)
    return utcMs >= start && utcMs < end
  }
  if (rule === 'AU') return utcMs >= at(9, 1, 2) || utcMs < at(3, 1, 2)
  if (rule === 'NZ') return utcMs >= at(8, -1, 2) || utcMs < at(3, 1, 2)
  return false
}

// Built-in cities, west to east. Offsets are standard time in minutes.
// These make T2 work even when no world clocks are set up on the watch.
export const CITIES = [
  { code: 'HNL', off: -600 },
  { code: 'ANC', off: -540, dst: 'US' },
  { code: 'LAX', off: -480, dst: 'US' },
  { code: 'PHX', off: -420 },
  { code: 'DEN', off: -420, dst: 'US' },
  { code: 'CHI', off: -360, dst: 'US' },
  { code: 'NYC', off: -300, dst: 'US' },
  { code: 'SAO', off: -180 },
  { code: 'UTC', off: 0 },
  { code: 'LON', off: 0, dst: 'EU' },
  { code: 'PAR', off: 60, dst: 'EU' },
  { code: 'ATH', off: 120, dst: 'EU' },
  { code: 'MOW', off: 180 },
  { code: 'DXB', off: 240 },
  { code: 'KHI', off: 300 },
  { code: 'BOM', off: 330 },
  { code: 'DAC', off: 360 },
  { code: 'BKK', off: 420 },
  { code: 'SIN', off: 480 },
  { code: 'HKG', off: 480 },
  { code: 'TYO', off: 540 },
  { code: 'SYD', off: 600, dst: 'AU' },
  { code: 'AKL', off: 720, dst: 'NZ' },
]

export function cityHM(city, utcMs) {
  return hmAt(utcMs, city.off + (dstActive(city.dst, utcMs, city.off) ? 60 : 0))
}

// Three LCD letters for a city. Unsupported characters become blanks.
export function cityCode(info) {
  let raw = String((info && (info.cityCode || info.city)) || '')
  try {
    raw = raw.normalize('NFD').replace(/[̀-ͯ]/g, '') // São -> Sao
  } catch (e) {}
  raw = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const code = raw.slice(0, 3)
  const out = []
  for (let i = 0; i < 3; i++) {
    const ch = code[i]
    out.push(ch && GLYPHS.indexOf(ch) >= 0 ? ch : null)
  }
  return out
}

// A watch world-clock entry -> { h, m }. The system's own hour/minute win;
// the zone offset is only a fallback.
export function worldClockHM(info, utcMs) {
  if (info && typeof info.hour === 'number' && typeof info.minute === 'number') {
    return { h: ((info.hour % 24) + 24) % 24, m: ((info.minute % 60) + 60) % 60 }
  }
  if (info && typeof info.timeZoneHour === 'number') {
    const mins = typeof info.timeZoneMinute === 'number' ? info.timeZoneMinute : 0
    const sign = info.timeZoneHour < 0 || mins < 0 ? -1 : 1
    return hmAt(utcMs, sign * (Math.abs(info.timeZoneHour) * 60 + Math.abs(mins)))
  }
  return hmAt(utcMs, 0)
}

// The T2 choices, in tap order: the watch's own world clocks first, then
// the built-in cities. Each has a stable key so the saved choice survives
// the list changing.
export function t2Sources(worldClocks) {
  const out = []
  ;(worldClocks || []).forEach((info, i) => {
    const letters = cityCode(info)
    out.push({ key: 'wc:' + i + ':' + letters.join(''), letters, info })
  })
  for (const c of CITIES) out.push({ key: c.code, letters: c.code.split(''), city: c })
  return out
}

export function sourceHM(src, utcMs) {
  return src.info ? worldClockHM(src.info, utcMs) : cityHM(src.city, utcMs)
}

// Index of the saved key; falls back to the first watch world clock if
// there is one, else UTC.
export function findSource(sources, key) {
  for (let i = 0; i < sources.length; i++) if (sources[i].key === key) return i
  if (key && key.indexOf('wc:') === 0) {
    // same slot, city renamed / list reshuffled: match by slot number
    const slot = key.split(':')[1]
    for (let i = 0; i < sources.length; i++) if (sources[i].key.indexOf('wc:' + slot + ':') === 0) return i
  }
  if (sources.length && sources[0].info) return 0
  for (let i = 0; i < sources.length; i++) if (sources[i].key === 'UTC') return i
  return 0
}

export function stepIndex(index, count, dir) {
  if (count <= 0) return 0
  return (((index + dir) % count) + count) % count
}

// T2 digits: [h1, h2, m1, m2] plus the AM/PM flag (null in 24h mode).
export function t2Digits(h, m, is12h) {
  let ampm = null
  let hs
  if (is12h) {
    ampm = h < 12 ? 'am' : 'pm'
    const h12 = h % 12 === 0 ? 12 : h % 12
    hs = h12 < 10 ? [null, String(h12)] : [String(h12)[0], String(h12)[1]]
  } else {
    const p = pad2(h)
    hs = [p[0], p[1]]
  }
  const ms = pad2(m)
  return { digits: [hs[0], hs[1], ms[0], ms[1]], ampm }
}
