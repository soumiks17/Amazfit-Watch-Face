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

// Day of month of a weekday (0 = Sunday .. 6 = Saturday). month is 0-based.
function nthWeekday(year, month, wd, n) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
  return 1 + ((wd - first + 7) % 7) + 7 * (n - 1)
}

function lastWeekday(year, month, wd) {
  const last = new Date(Date.UTC(year, month + 1, 0))
  return last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7)
}

function weekdayOnOrAfter(year, month, day, wd) {
  const d = new Date(Date.UTC(year, month, day)).getUTCDay()
  return day + ((wd - d + 7) % 7)
}

// Is daylight saving in force at utcMs for a zone with standard offset
// `off` (minutes) following `rule`? Rules follow the IANA tz database.
export function dstActive(rule, utcMs, off) {
  if (!rule) return false
  const y = new Date(utcMs).getUTCFullYear()
  const H = 3600000
  // UTC instant of `hour` local standard time on a given day
  const local = (month, day, hour, o) => Date.UTC(y, month, day, hour) - o * 60000
  const SUN = 0
  const THU = 4
  const FRI = 5
  if (rule === 'US') {
    // 2nd Sunday of March 02:00 -> 1st Sunday of November 02:00 (01:00 standard)
    return utcMs >= local(2, nthWeekday(y, 2, SUN, 2), 2, off) && utcMs < local(10, nthWeekday(y, 10, SUN, 1), 1, off)
  }
  if (rule === 'EU') {
    // last Sunday of March -> last Sunday of October, both 01:00 UTC
    return utcMs >= Date.UTC(y, 2, lastWeekday(y, 2, SUN), 1) && utcMs < Date.UTC(y, 9, lastWeekday(y, 9, SUN), 1)
  }
  if (rule === 'AU') {
    // 1st Sunday of October 02:00 -> 1st Sunday of April 03:00 (02:00 standard)
    return utcMs >= local(9, nthWeekday(y, 9, SUN, 1), 2, off) || utcMs < local(3, nthWeekday(y, 3, SUN, 1), 2, off)
  }
  if (rule === 'NZ') {
    // last Sunday of September -> 1st Sunday of April, 02:00 NZ standard
    // (Chatham switches at the same instant)
    return utcMs >= local(8, lastWeekday(y, 8, SUN), 2, 720) || utcMs < local(3, nthWeekday(y, 3, SUN, 1), 2, 720)
  }
  if (rule === 'CL') {
    // Sunday on/after 2 September 04:00 UTC -> Sunday on/after 2 April 03:00 UTC
    return utcMs >= Date.UTC(y, 8, weekdayOnOrAfter(y, 8, 2, SUN), 4) || utcMs < Date.UTC(y, 3, weekdayOnOrAfter(y, 3, 2, SUN), 3)
  }
  if (rule === 'IL') {
    // Friday before the last Sunday of March 02:00 -> last Sunday of October 02:00 (daylight)
    const start = local(2, lastWeekday(y, 2, SUN) - 2, 2, off)
    const end = local(9, lastWeekday(y, 9, SUN), 2, off) - H
    return utcMs >= start && utcMs < end
  }
  if (rule === 'EG') {
    // last Friday of April 00:00 -> last Thursday of October 24:00 (daylight)
    const start = local(3, lastWeekday(y, 3, FRI), 0, off)
    const end = local(9, lastWeekday(y, 9, THU), 24, off) - H
    return utcMs >= start && utcMs < end
  }
  return false
}

// Built-in cities, west to east, one or more for every UTC offset in use.
// `off` is standard time in minutes; `dst` names the daylight-saving rule.
export const CITIES = [
  { code: 'PPG', off: -660 },              // Pago Pago
  { code: 'HNL', off: -600 },              // Honolulu
  { code: 'ANC', off: -540, dst: 'US' },   // Anchorage
  { code: 'LAX', off: -480, dst: 'US' },   // Los Angeles
  { code: 'PHX', off: -420 },              // Phoenix
  { code: 'DEN', off: -420, dst: 'US' },   // Denver
  { code: 'MEX', off: -360 },              // Mexico City
  { code: 'CHI', off: -360, dst: 'US' },   // Chicago
  { code: 'NYC', off: -300, dst: 'US' },   // New York
  { code: 'SCL', off: -240, dst: 'CL' },   // Santiago
  { code: 'YHZ', off: -240, dst: 'US' },   // Halifax
  { code: 'YYT', off: -210, dst: 'US' },   // St. John's
  { code: 'SAO', off: -180 },              // Sao Paulo
  { code: 'FEN', off: -120 },              // Fernando de Noronha
  { code: 'PDL', off: -60, dst: 'EU' },    // Azores
  { code: 'UTC', off: 0 },
  { code: 'LON', off: 0, dst: 'EU' },      // London
  { code: 'LOS', off: 60 },                // Lagos
  { code: 'PAR', off: 60, dst: 'EU' },     // Paris
  { code: 'JNB', off: 120 },               // Johannesburg
  { code: 'CAI', off: 120, dst: 'EG' },    // Cairo
  { code: 'ATH', off: 120, dst: 'EU' },    // Athens
  { code: 'TLV', off: 120, dst: 'IL' },    // Tel Aviv
  { code: 'IST', off: 180 },               // Istanbul
  { code: 'MOW', off: 180 },               // Moscow
  { code: 'THR', off: 210 },               // Tehran
  { code: 'DXB', off: 240 },               // Dubai
  { code: 'KBL', off: 270 },               // Kabul
  { code: 'KHI', off: 300 },               // Karachi
  { code: 'BOM', off: 330 },               // Mumbai
  { code: 'KTM', off: 345 },               // Kathmandu
  { code: 'DAC', off: 360 },               // Dhaka
  { code: 'RGN', off: 390 },               // Yangon
  { code: 'BKK', off: 420 },               // Bangkok
  { code: 'SIN', off: 480 },               // Singapore
  { code: 'HKG', off: 480 },               // Hong Kong
  { code: 'TYO', off: 540 },               // Tokyo
  { code: 'ADL', off: 570, dst: 'AU' },    // Adelaide
  { code: 'BNE', off: 600 },               // Brisbane
  { code: 'SYD', off: 600, dst: 'AU' },    // Sydney
  { code: 'NOU', off: 660 },               // Noumea
  { code: 'AKL', off: 720, dst: 'NZ' },    // Auckland
  { code: 'CHT', off: 765, dst: 'NZ' },    // Chatham Islands
  { code: 'TBU', off: 780 },               // Nuku'alofa
  { code: 'CXI', off: 840 },               // Kiritimati
]

export function cityHM(city, utcMs) {
  return hmAt(utcMs, city.off + (dstActive(city.dst, utcMs, city.off) ? 60 : 0))
}

export function cityIndex(code) {
  for (let i = 0; i < CITIES.length; i++) if (CITIES[i].code === code) return i
  return -1
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
