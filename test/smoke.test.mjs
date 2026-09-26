// Runs app/watchface/index.js against a mocked @zos platform: catches
// throws in build() (a black screen on the watch), image paths that don't
// exist, and checks the tap zones and T2 behaviour end to end.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WF = path.join(ROOT, 'app', 'watchface')
const ASSETS = path.join(ROOT, 'app', 'assets', 'active-2-round')
const L = JSON.parse(fs.readFileSync(path.join(WF, 'layout.js'), 'utf8').replace(/^[\s\S]*?export const LAYOUT = /, ''))

// 2026-09-26 15:25 UTC (a Saturday)
const NOW = Date.UTC(2026, 8, 26, 15, 25)

async function boot({ scene = 1, clocks = [{ cityCode: 'NYC', hour: 11, minute: 25 }, { city: 'London', hour: 16, minute: 25 }], hourFormat = 0, store = {}, legacy = false } = {}) {
  const widgets = []
  const mock = {
    ui: {
      widget: { BUTTON: 'BUTTON', IMG: 'IMG', TEXT: 'TEXT', FILL_RECT: 'FILL_RECT', TIME_POINTER: 'TIME_POINTER', WIDGET_DELEGATE: 'WIDGET_DELEGATE' },
      prop: { MORE: 'MORE', SRC: 'SRC', TEXT: 'TEXT', ANGLE: 'ANGLE' },
      show_level: { ONLY_NORMAL: 1, ONAL_AOD: 2 },
      align: { LEFT: 0, CENTER_H: 16, RIGHT: 2 },
      event: { CLICK_UP: 'CLICK_UP' },
      createWidget(type, props) {
        const w = { type, props: { ...props },
          setProperty(k, v) { if (k === 'MORE') Object.assign(this.props, v); if (k === 'ANGLE') this.props.angle = v } }
        widgets.push(w)
        return w
      },
    },
    scene, clocks, hourFormat, legacy, store, launched: [],
  }
  globalThis.__zosMock = mock
  let face = null
  globalThis.WatchFace = (cfg) => { face = cfg }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rampart-'))
  const w = (f, src) => fs.writeFileSync(path.join(tmp, f), src)
  w('ui.mjs', 'const m = globalThis.__zosMock.ui; export const widget = m.widget, prop = m.prop, show_level = m.show_level, align = m.align, event = m.event, createWidget = m.createWidget.bind(m);')
  w('app.mjs', 'export const SCENE_AOD = 3; export const getScene = () => globalThis.__zosMock.scene;')
  w('storage.mjs', 'const s = globalThis.__zosMock.store; export const localStorage = { getItem: (k) => s[k], setItem: (k, v) => { s[k] = v } };')
  w('router.mjs', `
    const M = globalThis.__zosMock
    export const SYSTEM_APP_HR = 102, SYSTEM_APP_STATUS = 101, SYSTEM_APP_CALENDAR = 120, SYSTEM_APP_ALARM = 105, SYSTEM_APP_WORLD_CLOCK = 117
    export function launchApp(o) { M.launched.push(o) }
    export function checkSystemApp() {}
  `)
  w('sensor.mjs', `
    const M = globalThis.__zosMock
    export class Time { getTime() { return ${NOW} } getHourFormat() { return M.hourFormat } getDay() { return 6 } getDate() { return 26 } onPerMinute(f) { M.onMinute = f } offPerMinute() {} }
    export class Battery { getCurrent() { return 78 } }
    export class Step { getCurrent() { return 8432 } }
    export class HeartRate { getLast() { return 72 } getCurrent() { return 0 } onLastChange(f) {} }
    export class WorldClock {
      constructor() { if (M.legacy) { this.getWorldClockCount = () => M.clocks.length; this.getWorldClockInfo = (i) => M.clocks[i] } }
      getCount() { return M.legacy ? undefined : M.clocks.length }
      getInfo(i) { return M.legacy ? undefined : M.clocks[i] }
      destroy() {}
    }
  `)
  let src = fs.readFileSync(path.join(WF, 'index.js'), 'utf8')
  for (const mod of ['ui', 'app', 'sensor', 'storage', 'router']) src = src.replace(`'@zos/${mod}'`, `'${pathToFileURL(path.join(tmp, mod + '.mjs'))}'`)
  src = src.replace("'./layout.js'", `'${pathToFileURL(path.join(WF, 'layout.js'))}'`)
  src = src.replace("'./logic.js'", `'${pathToFileURL(path.join(WF, 'logic.js'))}'`)
  const entry = path.join(tmp, 'index.mjs')
  fs.writeFileSync(entry, src)
  await import(pathToFileURL(entry) + '?' + Math.random())
  face.build()
  return { widgets, mock }
}

const srcs = (widgets) => widgets.flatMap((w) => Object.values(w.props).filter((v) => typeof v === 'string' && v.endsWith('.png')))
const at = (widgets, [x, y]) => widgets.find((w) => w.type === 'IMG' && w.props.x === x && w.props.y === y).props.src
const city = (widgets) => L.t2_city.map((p) => at(widgets, p).replace(/^images\/cha?_|\.png$/g, '')).join('')
const button = (widgets, zone) => widgets.find((w) => w.type === 'BUTTON' && w.props.normal_src === `images/hit_${zone}.png`)
const gmt = (widgets) => widgets.find((w) => w.props.src === 'images/hand_gmt.png' || w.props.src === 'images/hand_gmt_aod.png')

test('normal scene builds and every referenced image exists', async () => {
  const { widgets } = await boot()
  assert.deepEqual(srcs(widgets).filter((s) => !fs.existsSync(path.join(ASSETS, s))), [])
  assert.ok(widgets.find((w) => w.type === 'TIME_POINTER').props.second_path)
})

test('T2 starts on the first watch world clock; tap = next, hold = previous', async () => {
  const { widgets, mock } = await boot()
  assert.equal(city(widgets), 'NYC')
  assert.equal(at(widgets, L.t2_digits[1]), 'images/lg_1.png') // 11:25
  assert.equal(gmt(widgets).props.angle, Math.round((11 * 60 + 25) / 1440 * 360))
  const lcd = button(widgets, 'lcd')
  lcd.props.click_func()
  assert.equal(city(widgets), 'LON')
  lcd.props.click_func() // -> built-in list starts
  assert.equal(city(widgets), 'HNL')
  lcd.props.longpress_func()
  lcd.props.longpress_func()
  assert.equal(city(widgets), 'NYC')
  assert.ok(mock.store.rampart_t2_key.startsWith('wc:0:'))
})

test('no world clocks on the watch: built-in cities with DST still work', async () => {
  const { widgets } = await boot({ clocks: [], store: { rampart_t2_key: 'BOM' }, hourFormat: 1 })
  assert.equal(city(widgets), 'BOM')
  // 15:25 UTC -> 20:55 IST
  assert.deepEqual(L.t2_digits.map((p) => at(widgets, p)), ['images/lg_2.png', 'images/lg_0.png', 'images/lg_5.png', 'images/lg_5.png'])
  button(widgets, 'lcd').props.click_func()
  assert.equal(city(widgets), 'DAC')
})

test('default with no world clocks and nothing saved is UTC', async () => {
  const { widgets } = await boot({ clocks: [] })
  assert.equal(city(widgets), 'UTC')
})

test('legacy world-clock method names are read too', async () => {
  const { widgets } = await boot({ legacy: true })
  assert.equal(city(widgets), 'NYC')
})

test('subdial needles point at HR and step-goal values', async () => {
  const { widgets } = await boot()
  const hr = widgets.find((w) => w.props.src === 'images/needle_hr.png')
  const st = widgets.find((w) => w.props.src === 'images/needle_steps.png')
  assert.equal(hr.props.angle, Math.round((-135 + 270 * (72 - 40) / 160 + 360) % 360))
  assert.equal(st.props.angle, Math.round(-135 + 270 * 0.8432))
  assert.equal(hr.props.center_x, L.subdials.hr[0])
})

test('tap zones open the matching system apps', async () => {
  const { widgets, mock } = await boot()
  const expect = { date: 120, hr: 102, steps: 101, center: 105 }
  for (const [zone, appId] of Object.entries(expect)) {
    button(widgets, zone).props.click_func()
    assert.deepEqual(mock.launched.at(-1), { appId, native: true })
  }
  const iPointer = widgets.findIndex((w) => w.type === 'TIME_POINTER')
  assert.ok(widgets.every((w, i) => w.type !== 'BUTTON' || i > iPointer))
})

test('AOD: dim LCD, GMT hand, no second hand, no tap zones', async () => {
  const { widgets } = await boot({ scene: 3 })
  assert.deepEqual(srcs(widgets).filter((s) => !fs.existsSync(path.join(ASSETS, s))), [])
  assert.equal(widgets.find((w) => w.type === 'TIME_POINTER').props.second_path, undefined)
  assert.ok(srcs(widgets).some((s) => s.startsWith('images/lga_')))
  assert.ok(gmt(widgets))
  assert.equal(widgets.filter((w) => w.type === 'BUTTON').length, 0)
})
