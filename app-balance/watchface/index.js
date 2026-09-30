// Rampart GMT - ana-digi chronograph-style watch face for Amazfit Active 2 (Round)
//
//   hands        local time
//   teal arrow   GMT hand: T2 on the 24-hour bezel
//   top dial     weekday, day of month, battery ring + %      tap: Calendar
//   left dial    heart rate gauge + digits                    tap: Heart Rate
//   bottom dial  steps gauge (0-10K) + steps today            tap: Activity
//   right LCD    T2: city code + digital time                 tap: next city
//                                                             double tap: World Clock app
//   centre                                                    tap: Alarms
//
// T2 steps through 45 built-in cities in order (every time zone in use,
// with daylight-saving rules). A watch face can't read the World Clock
// app's own city list - it keeps that in its private storage.
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
  digitsRight,
  hrDigits,
  stepDigits,
  batteryFrame,
  pad2,
  gaugeAngle,
  gmtAngle,
  CITIES,
  cityHM,
  cityIndex,
  stepIndex,
  t2Digits,
} from './logic.js'

const IMG = 'images/'
const STORE_KEY = 'rampart_t2_key' // code of the city T2 is showing
const DEFAULT_CITY = 'UTC'
const DOUBLE_TAP_MS = 350
const TIME_HOUR_FORMAT_12 = 0 // verified constant value on this runtime
const STEP_SCALE_MAX = 10000 // bottom dial reads 0 .. 10K steps, same units as the digits

// What each tap zone does: a @zos/router SYSTEM_APP_* constant name
// (API level 3.0), or one of the T2 gestures handled in build().
const TAP_ACTIONS = {
  date: { tap: 'SYSTEM_APP_CALENDAR' },
  hr: { tap: 'SYSTEM_APP_HR' },
  steps: { tap: 'SYSTEM_APP_STATUS' },
  center: { tap: 'SYSTEM_APP_ALARM' },
  lcd: { tap: 'next-city', doubletap: 'worldclock' },
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

// World Clock is not the same kind of app on every firmware. On newer Zepp
// OS builds it's a preinstalled mini-app (appId 1049670, the target
// community editors use for "World Time *"); older ones have it as a
// native system app. Try the forms in order; returns true if a launch call
// went through without throwing.
const WORLD_CLOCK_APP = { appId: 1049670, url: 'page/wclk_showLayer' }

function tryLaunch(opts) {
  if (typeof router.launchApp !== 'function') return false
  try {
    router.launchApp(opts)
    return true
  } catch (e) {
    return false
  }
}

function openWorldClock() {
  const sysId = router.SYSTEM_APP_WORLD_CLOCK
  if (typeof sysId === 'number' && call(router, 'checkSystemApp', { appId: sysId }) === true) {
    if (tryLaunch({ appId: sysId, native: true })) return true
  }
  if (tryLaunch(WORLD_CLOCK_APP)) return true
  if (typeof sysId === 'number') return tryLaunch({ appId: sysId, native: true })
  return false
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

function load(key) {
  try {
    const v = localStorage.getItem(key)
    return typeof v === 'string' ? v : null
  } catch (e) {
    return null
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch (e) {}
}

// A sprite slot: an IMG whose picture changes. Geometry is kept so every
// update sets x/y/w/h/src together (the update path verified on the
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

// A rotating image (subdial needle, GMT hand) pivoting at (cx, cy).
function rotor(cx, cy, spec, src, level) {
  const widget = hmUI.createWidget(hmUI.widget.IMG, {
    x: 0, y: 0, w: L.screen, h: L.screen,
    pos_x: cx - spec.px,
    pos_y: cy - spec.py,
    center_x: cx,
    center_y: cy,
    src: IMG + src,
    angle: 0,
    show_level: level,
  })
  let current = 0
  let shown = true
  return {
    set(angle) {
      if (angle === current) return
      current = angle
      widget.setProperty(hmUI.prop.ANGLE, angle)
    },
    show(on) {
      if (on === shown) return
      shown = on
      widget.setProperty(hmUI.prop.VISIBLE, on)
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

    // ---- static background ------------------------------------------------
    hmUI.createWidget(hmUI.widget.IMG, {
      x: 0, y: 0, w: L.screen, h: L.screen,
      src: IMG + (isAod ? 'aod_bg.png' : 'bg.png'),
      show_level: level,
    })

    // ---- T2 LCD -------------------------------------------------------------
    const t2Digit = L.t2_digits.map(([x, y]) => slot(x, y, S.lg.w, S.lg.h, level))
    const t2City = L.t2_city.map(([x, y]) => slot(x, y, S.ch.w, S.ch.h, level))
    const t2AmPm = slot(L.t2_ampm[0], L.t2_ampm[1], S.ampm.w, S.ampm.h, level)
    hmUI.createWidget(hmUI.widget.IMG, {
      x: L.t2_colon[0], y: L.t2_colon[1], w: S.colon.w, h: S.colon.h,
      src: IMG + 'colon' + sfx + '.png',
      show_level: level,
    })

    // ---- subdials (normal screen only) --------------------------------------
    let weekday = []
    let day = []
    let battPct = []
    let battRing = null
    let hrSlots = []
    let stepSlots = []
    let hrNeedle = null
    let stepNeedle = null
    if (!isAod) {
      weekday = L.weekday.map(([x, y]) => slot(x, y, S.ch.w, S.ch.h, level))
      day = L.day.map(([x, y]) => slot(x, y, S.md.w, S.md.h, level))
      battPct = L.batt_pct.map(([x, y]) => slot(x, y, S.sm.w, S.sm.h, level))
      const b = L.batt_arc
      battRing = slot(b[0], b[1], b[2], b[3], level)
      hrSlots = L.hr.map(([x, y]) => slot(x, y, S.sm.w, S.sm.h, level))
      stepSlots = L.steps.map(([x, y]) => slot(x, y, S.sm.w, S.sm.h, level))
      const hc = L.subdials.hr
      const sc = L.subdials.steps
      hrNeedle = rotor(hc[0], hc[1], L.needle, 'needle_hr.png', level)
      stepNeedle = rotor(sc[0], sc[1], L.needle, 'needle_steps.png', level)
    }

    // ---- GMT hand (under the main hands) ------------------------------------
    const gmtHand = rotor(C, C, L.gmt, isAod ? 'hand_gmt_aod.png' : 'hand_gmt.png', level)

    // ---- main hands -----------------------------------------------------------
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

    // ---- T2 -------------------------------------------------------------------
    let t2Index = cityIndex(load(STORE_KEY))
    if (t2Index < 0) t2Index = cityIndex(DEFAULT_CITY)
    let leftFace = false // set when the face goes off screen (an app opened)

    function renderT2() {
      let utcMs = num(time, 'getTime')
      if (utcMs === null) utcMs = Date.now()
      const city = CITIES[t2Index]
      const hm = cityHM(city, utcMs)

      const is12h = num(time, 'getHourFormat') === TIME_HOUR_FORMAT_12
      const { digits, ampm } = t2Digits(hm.h, hm.m, is12h)
      digits.forEach((d, k) => t2Digit[k].set(d === null ? null : `lg${sfx}_${d}.png`))
      city.code.split('').forEach((c, k) => t2City[k].set(`ch${sfx}_${c}.png`))
      t2AmPm.set(ampm ? `${ampm}${sfx}.png` : null)
      gmtHand.set(gmtAngle(hm.h, hm.m))
    }

    function nextCity() {
      t2Index = stepIndex(t2Index, CITIES.length, 1)
      save(STORE_KEY, CITIES[t2Index].code)
      renderT2()
    }

    // ---- date, battery, health -------------------------------------------------
    function renderDate() {
      if (isAod) return
      const wd = num(time, 'getDay') // 1..7, Monday first
      const name = wd >= 1 && wd <= 7 ? WEEKDAYS[wd - 1] : '   '
      weekday.forEach((s, i) => s.set(name[i] && name[i] !== ' ' ? `ch_${name[i]}.png` : null))
      const dd = pad2(num(time, 'getDate') || 0)
      day.forEach((s, i) => s.set(`md_${dd[i]}.png`))
      const pct = num(battery, 'getCurrent')
      battRing.set(`batt_${batteryFrame(pct)}.png`)
      const pd = pct === null ? [null, null, null] : digitsRight(Math.min(100, pct), 3)
      battPct.forEach((s, i) => s.set(pd[i] === null ? null : `sm_${pd[i]}.png`))
    }

    function renderHealth() {
      if (isAod) return
      const hr = readHeartRate(heart)
      hrDigits(hr).forEach((d, i) => hrSlots[i].set(d === null ? null : `sm_${d}.png`))
      hrNeedle.set(gaugeAngle(hr === null ? 40 : hr, 40, 200))

      const steps = num(step, 'getCurrent')
      stepDigits(steps).forEach((d, i) => stepSlots[i].set(d === null ? null : `sm_${d}.png`))
      stepNeedle.set(gaugeAngle(steps === null ? 0 : steps, 0, STEP_SCALE_MAX))
    }

    function refreshAll() {
      renderT2()
      renderDate()
      renderHealth()
    }

    refreshAll()

    // ---- tap zones ------------------------------------------------------------
    // Transparent BUTTONs created last so they sit above the hands. The
    // press image draws an orange frame / ring while touched.
    if (!isAod) {
      const run = (what) => {
        if (what === 'next-city') nextCity()
        else if (what === 'worldclock') {
          // If World Clock doesn't actually open (the face is still on
          // screen a moment later), fall back to the next city so the
          // gesture is never dead.
          leftFace = false
          const launched = openWorldClock()
          if (!launched) nextCity()
          else setTimeout(() => { if (!leftFace) nextCity() }, 1500)
        } else openSystemApp(what)
      }
      for (const name of Object.keys(TAP_ACTIONS)) {
        const action = TAP_ACTIONS[name]
        const zone = L.zones[name]
        if (!zone) continue
        const params = {
          x: zone[0], y: zone[1], w: zone[2], h: zone[3],
          text: '',
          normal_src: IMG + 'hit_' + name + '.png',
          press_src: IMG + 'press_' + name + '.png',
          show_level: level,
        }
        if (action.doubletap) {
          // One tap = action.tap, two quick taps = action.doubletap. The
          // single tap waits briefly so a double tap doesn't also fire it.
          let pending = null
          params.click_func = () => {
            if (pending !== null) {
              clearTimeout(pending)
              pending = null
              run(action.doubletap)
            } else {
              pending = setTimeout(() => {
                pending = null
                run(action.tap)
              }, DOUBLE_TAP_MS)
            }
          }
        } else if (action.tap) params.click_func = () => run(action.tap)
        if (action.hold) params.longpress_func = () => run(action.hold)
        try {
          hmUI.createWidget(hmUI.widget.BUTTON, params)
        } catch (e) {}
      }
    }

    // Minute tick: clocks, date, battery (both scenes).
    call(time, 'onPerMinute', () => {
      renderT2()
      renderDate()
    })

    // Health values: poll only while the face is visible.
    let timer = null
    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: () => {
        leftFace = false
        refreshAll()
        if (!isAod && timer === null) timer = setInterval(renderHealth, 30000)
      },
      pause_call: () => {
        leftFace = true
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
    }
  },

  onInit() {},

  onDestroy() {
    if (this._cleanup) this._cleanup()
  },
})
