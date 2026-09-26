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

test('DST rules match the real zones across 2025-2030', () => {
  const tz = { HNL: 'Pacific/Honolulu', ANC: 'America/Anchorage', LAX: 'America/Los_Angeles', PHX: 'America/Phoenix', DEN: 'America/Denver', CHI: 'America/Chicago', NYC: 'America/New_York', SAO: 'America/Sao_Paulo', UTC: 'UTC', LON: 'Europe/London', PAR: 'Europe/Paris', ATH: 'Europe/Athens', MOW: 'Europe/Moscow', DXB: 'Asia/Dubai', KHI: 'Asia/Karachi', BOM: 'Asia/Kolkata', DAC: 'Asia/Dhaka', BKK: 'Asia/Bangkok', SIN: 'Asia/Singapore', HKG: 'Asia/Hong_Kong', TYO: 'Asia/Tokyo', SYD: 'Australia/Sydney', AKL: 'Pacific/Auckland' }
  let bad = 0
  for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2031, 0, 1); t += 37 * 60000 * 29) {
    for (const c of L.CITIES) {
      const want = new Intl.DateTimeFormat('en-GB', { timeZone: tz[c.code], hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t)
      const { h, m } = L.cityHM(c, t)
      if (want !== L.pad2(h) + ':' + L.pad2(m)) bad++
    }
  }
  assert.equal(bad, 0)
})

test('world clock info and city codes', () => {
  assert.deepEqual(L.worldClockHM({ hour: 7, minute: 5 }, 0), { h: 7, m: 5 })
  assert.deepEqual(L.cityCode({ city: 'São Paulo' }), ['S', 'A', 'O'])
})

test('T2 sources: watch clocks first, then built-ins; saved key lookup', () => {
  const s = L.t2Sources([{ cityCode: 'NYC', hour: 1, minute: 2 }])
  assert.equal(s[0].key, 'wc:0:NYC')
  assert.equal(s[1].key, 'HNL')
  assert.equal(L.findSource(s, 'BOM'), s.findIndex((x) => x.key === 'BOM'))
  assert.equal(L.findSource(s, null), 0)
  assert.equal(L.findSource(L.t2Sources([]), null), L.CITIES.findIndex((c) => c.code === 'UTC'))
  assert.equal(L.findSource(s, 'wc:0:NEW'), 0)
  assert.equal(L.stepIndex(0, 5, -1), 4)
})

test('T2 digits in 12h and 24h', () => {
  assert.deepEqual(L.t2Digits(0, 5, true), { digits: ['1', '2', '0', '5'], ampm: 'am' })
  assert.deepEqual(L.t2Digits(13, 45, true), { digits: [null, '1', '4', '5'], ampm: 'pm' })
  assert.deepEqual(L.t2Digits(9, 5, false), { digits: ['0', '9', '0', '5'], ampm: null })
})
