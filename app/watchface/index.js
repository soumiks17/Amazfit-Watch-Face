// Rampart - rugged ana-digi watch face for Amazfit Active 2 (Round)
//
// Analog hands show local time. The LCD windows show:
//   top    weekday, day of month, battery bar
//   left   heart rate (last measurement)
//   right  steps today
//   bottom T2 - a second time zone. Tap it to cycle through the world
//          clocks set up on the watch, then UTC; hold it to open World Clock.
//
// Taps: date window -> Calendar, HR -> Heart Rate, steps -> Activity,
// centre (hands) -> Alarms.
//
// This file is the only one that touches the platform. It uses the @zos/*
// module API; the old hmUI / hmSensor globals do not exist on this runtime
// and code written against them fails silently (black screen).

import * as hmUI from '@zos/ui'
import { getScene, SCENE_AOD } from '@zos/app'
import * as sensor from '@zos/sensor'
import { localStorage } from '@zos/storage'
import * as router from '@zos/router'

import { LAYOUT as L } from './layout.js'
import {
  WEEKDAYS,
  hrDigits,
  stepDigits,
  batteryFrame,
  pad2,
  hmAt,
  worldClockHM,
  cityCode,
  t2Digits,
  nextIndex,
  clampIndex,
} from './logic.js'

const IMG = 'images/'
const STORE_KEY = 'rampart_t2_index'
const TIME_HOUR_FORMAT_12 = 0 // verified constant value on this runtime

// What each tap zone does. Values are @zos/router SYSTEM_APP_* constant
// names (API level 3.0); 'cycle' steps T2 to the next city.
const TAP_ACTIONS = {
  top: { tap: 'SYSTEM_APP_CALENDAR' },
  hr: { tap: 'SYSTEM_APP_HR' },
  steps: { tap: 'SYSTEM_APP_STATUS' },
  center: { tap: 'SYSTEM_APP_ALARM' },
  t2: { tap: 'cycle', hold: 'SYSTEM_APP_WORLD_CLOCK' },
}

// Open a built-in app. Silently does nothing if this firmware doesn't know
// the app or doesn't allow the jump.
function openSystemApp(constName) {
  const appId = router[constName]
  if (typeof appId !== 'number' || typeof router.launchApp !== 'function') return
  try {
    if (typeof router.checkSystemApp === 'function' && router.checkSystemApp({ appId }) === false) return
    router.launchApp({ appId, native: true })
  } catch (e) {}
}

// ---- defensive helpers: an uncaught throw in build() = black screen -------
function make(Ctor) {
  if (typeof Ctor !== 'function') return null
  try {
    return new Ctor()
  } catch (e) {
    return null
  }
}

function call(obj, method, ...args) {
  if (!obj || typeof obj[method] !== 'function') return null
  try {
    return obj[method](...args)
  } catch (e) {
    return null
  }
}

function num(obj, method) {
  const v = call(obj, method)
  return typeof v === 'number' && isFinite(v) ? v : null
}

// getLast(), not getCurrent(): on the watch getCurrent() only reports a
// continuous measurement in progress, which a face never starts, so it
// reads 0 all day. The simulator answers both, so fall back for it.
function readHeartRate(hr) {
  const last = num(hr, 'getLast')
  if (last !== null && last > 0) return last
  const cur = num(hr, 'getCurrent')
  return cur !== null && cur > 0 ? cur : null
}

function loadIndex() {
  try {
    const v = localStorage.getItem(STORE_KEY)
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  } catch (e) {
    return 0
  }
}

function saveIndex(i) {
  try {
    localStorage.setItem(STORE_KEY, String(i))
  } catch (e) {
    // storage unavailable: selection just won't survive a face reload
  }
}

// A sprite slot: an IMG widget whose picture changes. Geometry is kept so
// every update sets x/y/w/h/src together (the update path verified on the
// Active 2 runtime).
function slot(x, y, w, h, level) {
  const widget = hmUI.createWidget(hmUI.widget.IMG, {
    x, y, w, h,
    src: IMG + 'blank.png',
    show_level: level,
  })
  let current = 'blank.png'
  return {
    set(name) {
      const next = name || 'blank.png'
      if (next === current) return
      current = next
      widget.setProperty(hmUI.prop.MORE, { x, y, w, h, src: IMG + next })
    },
  }
}

WatchFace({
  build() {
    const isAod = getScene() === SCENE_AOD
    const level = isAod ? hmUI.show_level.ONAL_AOD : hmUI.show_level.ONLY_NORMAL
    const sfx = isAod ? 'a' : '' // dimmer LCD sprites in always-on mode
    const S = L.sizes
    const C = L.center

    const time = make(sensor.Time)
    const battery = isAod ? null : make(sensor.Battery)
    const step = isAod ? null : make(sensor.Step)
    const heart = isAod ? null : make(sensor.HeartRate)
    const world = make(sensor.WorldClock)

    // ---- static background ------------------------------------------------
    hmUI.createWidget(hmUI.widget.IMG, {
      x: 0, y: 0, w: L.screen, h: L.screen,
      src: IMG + (isAod ? 'aod_bg.png' : 'bg.png'),
      show_level: level,
    })

    // ---- live LCD slots -----------------------------------------------------
    const t2Digit = L.t2_digits.map(([x, y]) => slot(x, y, S.lg.w, S.lg.h, level))
    const t2City = L.t2_city.map(([x, y]) => slot(x, y, S.ch.w, S.ch.h, level))
    const t2AmPm = slot(L.t2_ampm[0], L.t2_ampm[1], S.ampm.w, S.ampm.h, level)
    hmUI.createWidget(hmUI.widget.IMG, {
      x: L.t2_colon[0], y: L.t2_colon[1], w: S.colon.w, h: S.colon.h,
      src: IMG + 'colon' + sfx + '.png',
      show_level: level,
    })

    let weekday = []
    let day = []
    let batt = null
    let hrSlots = []
    let stepSlots = []
    if (!isAod) {
      weekday = L.weekday.map(([x, y]) => slot(x, y, S.ch.w, S.ch.h, level))
      day = L.day.map(([x, y]) => slot(x, y, S.sm.w, S.sm.h, level))
      batt = slot(L.batt[0], L.batt[1], S.batt.w, S.batt.h, level)
      hrSlots = L.hr.map(([x, y]) => slot(x, y, S.sm.w, S.sm.h, level))
      stepSlots = L.steps.map(([x, y]) => slot(x, y, S.sm.w, S.sm.h, level))
    }

    // ---- hands --------------------------------------------------------------
    const H = L.hands
    const hub = L.hub.size
    const pointer = {
      hour_centerX: C, hour_centerY: C,
      hour_posX: H.hour.px, hour_posY: H.hour.py,
      hour_path: IMG + (isAod ? 'hand_h_aod.png' : 'hand_h.png'),
      minute_centerX: C, minute_centerY: C,
      minute_posX: H.minute.px, minute_posY: H.minute.py,
      minute_path: IMG + (isAod ? 'hand_m_aod.png' : 'hand_m.png'),
      show_level: level,
    }
    if (isAod) {
      pointer.minute_cover_path = IMG + 'hub_aod.png'
      pointer.minute_cover_x = C - hub / 2
      pointer.minute_cover_y = C - hub / 2
    } else {
      pointer.second_centerX = C
      pointer.second_centerY = C
      pointer.second_posX = H.second.px
      pointer.second_posY = H.second.py
      pointer.second_path = IMG + 'hand_s.png'
      pointer.second_cover_path = IMG + 'hub.png'
      pointer.second_cover_x = C - hub / 2
      pointer.second_cover_y = C - hub / 2
    }
    hmUI.createWidget(hmUI.widget.TIME_POINTER, pointer)

    // ---- T2: second time zone ----------------------------------------------
    let t2Index = loadIndex()

    function renderT2() {
      let utcMs = num(time, 'getTime')
      if (utcMs === null) utcMs = Date.now()
      const count = num(world, 'getCount') || 0
      t2Index = clampIndex(t2Index, count)

      let hm
      let city
      if (t2Index < count) {
        const info = call(world, 'getInfo', t2Index)
        hm = worldClockHM(info, utcMs)
        city = cityCode(info)
      } else {
        hm = hmAt(utcMs, 0)
        city = ['U', 'T', 'C']
      }

      const is12h = num(time, 'getHourFormat') === TIME_HOUR_FORMAT_12
      const { digits, ampm } = t2Digits(hm.h, hm.m, is12h)
      digits.forEach((d, i) => t2Digit[i].set(d === null ? null : `lg${sfx}_${d}.png`))
      city.forEach((c, i) => t2City[i].set(c === null ? null : `ch${sfx}_${c}.png`))
      t2AmPm.set(ampm ? `${ampm}${sfx}.png` : null)
    }

    // ---- everything else ----------------------------------------------------
    function renderDate() {
      if (isAod) return
      const wd = num(time, 'getDay') // 1..7, Monday first
      const name = wd >= 1 && wd <= 7 ? WEEKDAYS[wd - 1] : '   '
      weekday.forEach((s, i) => s.set(name[i] && name[i] !== ' ' ? `ch_${name[i]}.png` : null))
      const dd = pad2(num(time, 'getDate') || 0)
      day.forEach((s, i) => s.set(`sm_${dd[i]}.png`))
      batt.set(`batt_${batteryFrame(num(battery, 'getCurrent'))}.png`)
    }

    function renderHealth() {
      if (isAod) return
      hrDigits(readHeartRate(heart)).forEach((d, i) => hrSlots[i].set(d === null ? null : `sm_${d}.png`))
      stepDigits(num(step, 'getCurrent')).forEach((d, i) => stepSlots[i].set(d === null ? null : `sm_${d}.png`))
    }

    function refreshAll() {
      renderT2()
      renderDate()
      renderHealth()
    }

    refreshAll()

    // ---- tap zones ------------------------------------------------------------
    // Transparent BUTTONs created last so they sit above the hands. The
    // press image draws an orange frame around the window while touched.
    if (!isAod) {
      const cycleT2 = () => {
        const count = num(world, 'getCount') || 0
        t2Index = nextIndex(t2Index, count)
        saveIndex(t2Index)
        renderT2()
      }
      for (const [name, action] of Object.entries(TAP_ACTIONS)) {
        const zone = L.zones[name]
        if (!zone) continue
        const params = {
          x: zone[0], y: zone[1], w: zone[2], h: zone[3],
          text: '',
          normal_src: IMG + 'hit_' + name + '.png',
          press_src: IMG + 'press_' + name + '.png',
          show_level: level,
        }
        if (action.tap === 'cycle') params.click_func = cycleT2
        else if (action.tap) params.click_func = () => openSystemApp(action.tap)
        if (action.hold) params.longpress_func = () => openSystemApp(action.hold)
        try {
          hmUI.createWidget(hmUI.widget.BUTTON, params)
        } catch (e) {
          // a zone that can't be created just isn't tappable
        }
      }
    }

    // Minute tick drives the clock-ish things in both scenes.
    call(time, 'onPerMinute', () => {
      renderT2()
      renderDate()
    })

    // Health values move slowly; poll only while the face is visible.
    let timer = null
    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: () => {
        refreshAll()
        if (!isAod && timer === null) timer = setInterval(renderHealth, 30000)
      },
      pause_call: () => {
        if (timer !== null) {
          clearInterval(timer)
          timer = null
        }
      },
    })

    // New HR sample lands on the sensor's own schedule. NOT onCurrentChange:
    // that starts a continuous measurement and drains the battery.
    if (heart && typeof heart.onLastChange === 'function') {
      try {
        heart.onLastChange(renderHealth)
      } catch (e) {}
    }

    this._cleanup = () => {
      if (timer !== null) clearInterval(timer)
      call(time, 'offPerMinute')
      call(world, 'destroy')
      call(world, 'uninit')
    }
  },

  onInit() {},

  onDestroy() {
    if (this._cleanup) this._cleanup()
  },
})
