import test from 'node:test'
import assert from 'node:assert/strict'
import * as L from '../app/watchface/logic.js'

test('digitsRight pads with blanks and keeps the low digits', () => {
  assert.deepEqual(L.digitsRight(72, 3), [null, '7', '2'])
  assert.deepEqual(L.digitsRight(123456, 5), ['2', '3', '4', '5', '6'])
})

test('heart rate: no reading shows --', () => {
  assert.deepEqual(L.hrDigits(null), [null, 'dash', 'dash'])
  assert.deepEqual(L.hrDigits(0), [null, 'dash', 'dash'])
  assert.deepEqual(L.hrDigits(104), ['1', '0', '4'])
})

test('battery frames', () => {
  assert.equal(L.batteryFrame(0), 0)
  assert.equal(L.batteryFrame(1), 1)
  assert.equal(L.batteryFrame(78), 8)
  assert.equal(L.batteryFrame(100), 10)
  assert.equal(L.batteryFrame(null), 0)
})

test('UTC and offsets wrap around midnight', () => {
  const ms = Date.UTC(2026, 8, 26, 23, 50)
  assert.deepEqual(L.hmAt(ms, 0), { h: 23, m: 50 })
  assert.deepEqual(L.hmAt(ms, 60), { h: 0, m: 50 })
  assert.deepEqual(L.hmAt(ms, -330), { h: 18, m: 20 })
})

test('world clock info: reported hour/minute win, offsets are the fallback', () => {
  const ms = Date.UTC(2026, 8, 26, 12, 0)
  assert.deepEqual(L.worldClockHM({ hour: 7, minute: 5 }, ms), { h: 7, m: 5 })
  assert.deepEqual(L.worldClockHM({ timeZoneHour: 5, timeZoneMinute: 30 }, ms), { h: 17, m: 30 })
  assert.deepEqual(L.worldClockHM({ timeZoneHour: -3, timeZoneMinute: 30 }, ms), { h: 8, m: 30 })
})

test('city codes', () => {
  assert.deepEqual(L.cityCode({ cityCode: 'nyc' }), ['N', 'Y', 'C'])
  assert.deepEqual(L.cityCode({ city: 'São Paulo' }), ['S', 'A', 'O'])
  assert.deepEqual(L.cityCode({}), [null, null, null])
})

test('T2 digits in 12h and 24h', () => {
  assert.deepEqual(L.t2Digits(0, 5, true), { digits: ['1', '2', '0', '5'], ampm: 'am' })
  assert.deepEqual(L.t2Digits(9, 5, true), { digits: [null, '9', '0', '5'], ampm: 'am' })
  assert.deepEqual(L.t2Digits(13, 45, true), { digits: [null, '1', '4', '5'], ampm: 'pm' })
  assert.deepEqual(L.t2Digits(9, 5, false), { digits: ['0', '9', '0', '5'], ampm: null })
})

test('tap cycling: clocks then UTC then back', () => {
  assert.equal(L.nextIndex(0, 2), 1)
  assert.equal(L.nextIndex(1, 2), 2) // UTC
  assert.equal(L.nextIndex(2, 2), 0)
  assert.equal(L.nextIndex(0, 0), 0) // only UTC available
  assert.equal(L.clampIndex(5, 2), 0)
})
