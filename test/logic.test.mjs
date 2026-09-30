import test from 'node:test'
import assert from 'node:assert/strict'
import * as L from '../app/watchface/logic.js'

test('digits', () => {
  assert.deepEqual(L.digitsRight(72, 3), [null, '7', '2'])
  assert.deepEqual(L.hrDigits(0), [null, 'dash', 'dash'])
  assert.deepEqual(L.stepDigits(123456), ['9', '9', '9', '9', '9'])
})

test('battery frames', () => {
  assert.equal(L.batteryFrame(0), 0)
  assert.equal(L.batteryFrame(78), 8)
  assert.equal(L.batteryFrame(100), 10)
})

test('gauge and GMT angles', () => {
  assert.equal(L.gaugeAngle(40, 40, 200), 225)
  assert.equal(L.gaugeAngle(120, 40, 200), 0)
  assert.equal(L.gaugeAngle(500, 40, 200), 135)
  assert.equal(L.gmtAngle(12, 0), 180)
  assert.equal(L.gmtAngle(6, 0), 90)
})

test('all 45 cities match the real time zones to the minute, 2025-2030', () => {
  const tz = { PPG: 'Pacific/Pago_Pago', HNL: 'Pacific/Honolulu', ANC: 'America/Anchorage', LAX: 'America/Los_Angeles', PHX: 'America/Phoenix', DEN: 'America/Denver', MEX: 'America/Mexico_City', CHI: 'America/Chicago', NYC: 'America/New_York', SCL: 'America/Santiago', YHZ: 'America/Halifax', YYT: 'America/St_Johns', SAO: 'America/Sao_Paulo', FEN: 'America/Noronha', PDL: 'Atlantic/Azores', UTC: 'UTC', LON: 'Europe/London', LOS: 'Africa/Lagos', PAR: 'Europe/Paris', JNB: 'Africa/Johannesburg', CAI: 'Africa/Cairo', ATH: 'Europe/Athens', TLV: 'Asia/Jerusalem', IST: 'Europe/Istanbul', MOW: 'Europe/Moscow', THR: 'Asia/Tehran', DXB: 'Asia/Dubai', KBL: 'Asia/Kabul', KHI: 'Asia/Karachi', BOM: 'Asia/Kolkata', KTM: 'Asia/Kathmandu', DAC: 'Asia/Dhaka', RGN: 'Asia/Yangon', BKK: 'Asia/Bangkok', SIN: 'Asia/Singapore', HKG: 'Asia/Hong_Kong', TYO: 'Asia/Tokyo', ADL: 'Australia/Adelaide', BNE: 'Australia/Brisbane', SYD: 'Australia/Sydney', NOU: 'Pacific/Noumea', AKL: 'Pacific/Auckland', CHT: 'Pacific/Chatham', TBU: 'Pacific/Tongatapu', CXI: 'Pacific/Kiritimati' }
  assert.equal(L.CITIES.length, 45)
  assert.deepEqual(L.CITIES.map((c) => c.code).sort(), Object.keys(tz).sort())
  let bad = 0
  for (const c of L.CITIES) {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz[c.code], hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    const ok = (t) => { const { h, m } = L.cityHM(c, t); return f.format(t) === L.pad2(h) + ':' + L.pad2(m) }
    // hourly, then minute by minute around every clock change
    let prev = null
    for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2031, 0, 1); t += 3600000) {
      const s = f.format(t)
      if (!ok(t)) bad++
      if (prev !== null) {
        const [ph, pm] = prev.split(':').map(Number)
        const [h, m] = s.split(':').map(Number)
        if (((h * 60 + m) - (ph * 60 + pm) + 1440) % 1440 !== 60) {
          for (let u = t - 7200000; u < t + 7200000; u += 60000) if (!ok(u)) bad++
        }
      }
      prev = s
    }
  }
  assert.equal(bad, 0)
})

test('city lookup and stepping', () => {
  assert.equal(L.CITIES[L.cityIndex('UTC')].off, 0)
  assert.equal(L.cityIndex('wc:0:NYC'), -1)
  assert.equal(L.stepIndex(44, 45, 1), 0)
})

test('T2 digits in 12h and 24h', () => {
  assert.deepEqual(L.t2Digits(0, 5, true), { digits: ['1', '2', '0', '5'], ampm: 'am' })
  assert.deepEqual(L.t2Digits(13, 45, true), { digits: [null, '1', '4', '5'], ampm: 'pm' })
  assert.deepEqual(L.t2Digits(9, 5, false), { digits: ['0', '9', '0', '5'], ampm: null })
})

