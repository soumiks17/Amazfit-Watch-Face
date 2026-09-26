// Pure display logic - no @zos imports, so it runs under plain Node for the
// tests in /test. index.js is the only file that touches the platform.

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
export const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

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

// Hours/minutes of a UTC timestamp (ms), shifted by `offsetMin` minutes.
export function hmAt(utcMs, offsetMin) {
  const total = Math.floor(utcMs / 60000) + (offsetMin || 0)
  const day = ((total % 1440) + 1440) % 1440
  return { h: Math.floor(day / 60), m: day % 60 }
}

// A world clock entry -> { h, m }. Prefers the hour/minute the system
// reports; falls back to the zone offset when those are missing.
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

// Tap cycles: world clock 0 .. count-1, then UTC, then back to 0.
export function nextIndex(index, count) {
  const n = Math.max(0, count | 0) + 1
  return (((index | 0) + 1) % n + n) % n
}

export function clampIndex(index, count) {
  const i = index | 0
  return i >= 0 && i <= count ? i : 0
}
