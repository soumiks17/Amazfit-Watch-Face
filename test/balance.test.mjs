// The Amazfit Balance project (app-balance/, made by tools/make_balance.py)
// must behave exactly like the Active 2 one: run the same smoke tests on it.
import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.RAMPART_APP = 'app-balance'
process.env.RAMPART_TARGET = 'balance'

test('Balance project uses the same watch-face code as the Active 2 one', () => {
  for (const f of ['app.js', 'watchface/index.js', 'watchface/logic.js']) {
    assert.equal(fs.readFileSync(`app-balance/${f}`, 'utf8'), fs.readFileSync(`app/${f}`, 'utf8'), `${f} differs - re-run npm run balance`)
  }
  const app = JSON.parse(fs.readFileSync('app-balance/app.json', 'utf8'))
  assert.deepEqual(Object.keys(app.targets), ['balance'])
  assert.equal(app.targets.balance.designWidth, 480)
  assert.deepEqual(app.targets.balance.platforms.map((p) => p.deviceSource), [8519936, 8519937, 8519939])
})

await import('./smoke.test.mjs?balance')
