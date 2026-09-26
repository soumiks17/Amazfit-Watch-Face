// Runs app/watchface/index.js against a mocked @zos platform: catches
// throws in build() (a black screen on the watch) and any image path that
// doesn't exist in the assets folder.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WF = path.join(ROOT, 'app', 'watchface')
const ASSETS = path.join(ROOT, 'app', 'assets', 'active-2-round')

async function boot({ scene = 1, clocks = [{ cityCode: 'NYC', hour: 11, minute: 25 }, { city: 'London', hour: 16, minute: 25 }], hourFormat = 0 } = {}) {
  const widgets = []
  const mock = {
    ui: {
      widget: { BUTTON: 'BUTTON', IMG: 'IMG', TEXT: 'TEXT', FILL_RECT: 'FILL_RECT', TIME_POINTER: 'TIME_POINTER', WIDGET_DELEGATE: 'WIDGET_DELEGATE' },
      prop: { MORE: 'MORE', SRC: 'SRC', TEXT: 'TEXT' },
      show_level: { ONLY_NORMAL: 1, ONAL_AOD: 2 },
      align: { LEFT: 0, CENTER_H: 16, RIGHT: 2 },
      event: { CLICK_UP: 'CLICK_UP' },
      createWidget(type, props) {
        const w = { type, props: { ...props }, listeners: {},
          setProperty(k, v) { if (k === 'MORE') Object.assign(this.props, v) },
          addEventListener(ev, fn) { this.listeners[ev] = fn } }
        widgets.push(w)
        return w
      },
    },
    scene,
    clocks,
    hourFormat,
    store: {},
    launched: [],
  }
  globalThis.__zosMock = mock
  let face = null
  globalThis.WatchFace = (cfg) => { face = cfg }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rampart-'))
  fs.writeFileSync(path.join(tmp, 'ui.mjs'), 'const m = globalThis.__zosMock.ui; export const widget = m.widget, prop = m.prop, show_level = m.show_level, align = m.align, event = m.event, createWidget = m.createWidget.bind(m);')
  fs.writeFileSync(path.join(tmp, 'app.mjs'), 'export const SCENE_AOD = 3; export const getScene = () => globalThis.__zosMock.scene;')
  fs.writeFileSync(path.join(tmp, 'storage.mjs'), 'const s = globalThis.__zosMock.store; export const localStorage = { getItem: (k) => s[k], setItem: (k, v) => { s[k] = v } };')
  fs.writeFileSync(path.join(tmp, 'sensor.mjs'), `
    const M = globalThis.__zosMock
    export class Time { getTime() { return Date.UTC(2026, 8, 26, 15, 25) } getHourFormat() { return M.hourFormat } getDay() { return 6 } getDate() { return 26 } onPerMinute(f) { M.onMinute = f } offPerMinute() {} }
    export class Battery { getCurrent() { return 78 } }
    export class Step { getCurrent() { return 8432 } }
    export class HeartRate { getLast() { return 72 } getCurrent() { return 0 } onLastChange(f) {} }
    export class WorldClock { getCount() { return M.clocks.length } getInfo(i) { return M.clocks[i] } destroy() {} }
  `)
  fs.writeFileSync(path.join(tmp, 'router.mjs'), `
    const M = globalThis.__zosMock
    export const SYSTEM_APP_HR = 102, SYSTEM_APP_STATUS = 101, SYSTEM_APP_CALENDAR = 120, SYSTEM_APP_ALARM = 105, SYSTEM_APP_WORLD_CLOCK = 117
    export function launchApp(o) { M.launched.push(o) }
    export function checkSystemApp() {}
  `)
  let src = fs.readFileSync(path.join(WF, 'index.js'), 'utf8')
  for (const mod of ['ui', 'app', 'sensor', 'storage', 'router']) src = src.replace(`'@zos/${mod}'`, `'${pathToFileURL(path.join(tmp, mod + '.mjs'))}'`)
  src = src.replace("'./layout.js'", `'${pathToFileURL(path.join(WF, 'layout.js'))}'`)
  src = src.replace("'./logic.js'", `'${pathToFileURL(path.join(WF, 'logic.js'))}'`)
  const entry = path.join(tmp, 'index.mjs')
  fs.writeFileSync(entry, src)
  await import(pathToFileURL(entry) + '?' + Math.random())
  face.build()
  return { widgets, mock, face }
}

function srcs(widgets) {
  const out = []
  for (const w of widgets) for (const [k, v] of Object.entries(w.props)) if (typeof v === 'string' && v.endsWith('.png')) out.push(v)
  return out
}

function button(widgets, zone) {
  return widgets.find((w) => w.type === 'BUTTON' && w.props.normal_src === `images/hit_${zone}.png`)
}

function t2State(widgets) {
  const get = (x, y) => widgets.find((w) => w.type === 'IMG' && w.props.x === x && w.props.y === y).props.src
  return get
}

test('normal scene builds and every referenced image exists', async () => {
  const { widgets } = await boot()
  const missing = srcs(widgets).filter((s) => !fs.existsSync(path.join(ASSETS, s)))
  assert.deepEqual(missing, [])
  const pointer = widgets.find((w) => w.type === 'TIME_POINTER')
  assert.ok(pointer.props.second_path, 'second hand present')
})

test('T2 shows the first world clock and tapping cycles to the next, then UTC', async () => {
  const { widgets, mock } = await boot()
  const get = t2State(widgets)
  assert.equal(get(198, 284), 'images/ch_N.png')
  assert.equal(get(190, 308), 'images/lg_1.png') // 11:25 -> ' 1' '1'
  const hit = button(widgets, 't2')
  hit.props.click_func()
  assert.equal(get(198, 284), 'images/ch_L.png')
  hit.props.click_func()
  assert.equal(get(198, 284), 'images/ch_U.png') // UTC 15:25 -> 3:25 PM
  assert.equal(get(190, 308), 'images/lg_3.png')
  assert.equal(get(281, 286), 'images/pm.png')
  assert.equal(mock.store.rampart_t2_index, '2')
})

test('no world clocks configured: T2 falls back to UTC in 24h', async () => {
  const { widgets } = await boot({ clocks: [], hourFormat: 1 })
  const get = t2State(widgets)
  assert.equal(get(198, 284), 'images/ch_U.png')
  assert.equal(get(153, 308), 'images/lg_1.png')
  assert.equal(get(190, 308), 'images/lg_5.png')
  assert.equal(get(281, 286), 'images/blank.png')
})

test('AOD scene builds with dim sprites and no second hand', async () => {
  const { widgets } = await boot({ scene: 3 })
  const missing = srcs(widgets).filter((s) => !fs.existsSync(path.join(ASSETS, s)))
  assert.deepEqual(missing, [])
  const pointer = widgets.find((w) => w.type === 'TIME_POINTER')
  assert.equal(pointer.props.second_path, undefined)
  assert.ok(srcs(widgets).includes('images/aod_bg.png'))
  assert.ok(srcs(widgets).some((s) => s.startsWith('images/lga_')))
})

test('tap zones open the matching system apps; T2 hold opens World Clock', async () => {
  const { widgets, mock } = await boot()
  const expect = { top: 120, hr: 102, steps: 101, center: 105 }
  for (const [zone, appId] of Object.entries(expect)) {
    const b = button(widgets, zone)
    assert.ok(b, `button for ${zone}`)
    b.props.click_func()
    assert.deepEqual(mock.launched.at(-1), { appId, native: true })
  }
  button(widgets, 't2').props.longpress_func()
  assert.deepEqual(mock.launched.at(-1), { appId: 117, native: true })
  // buttons sit above the hands
  const iPointer = widgets.findIndex((w) => w.type === 'TIME_POINTER')
  assert.ok(widgets.every((w, i) => w.type !== 'BUTTON' || i > iPointer))
})

test('AOD has no tap zones', async () => {
  const { widgets } = await boot({ scene: 3 })
  assert.equal(widgets.filter((w) => w.type === 'BUTTON').length, 0)
})
