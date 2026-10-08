import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  colorFor,
  describeRaw,
  describeWindows,
  inlineWidth,
  percentText,
  pickRows,
  splitBar,
  visibleRows,
} from '../hooks/bars'
import { USAGE_URL, findScopedPercent, readingFrom } from '../hooks/usage-api'

const band = (bodyColumns: number) =>
  ({
    plugin: 'limit-bars',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 9 },
      view: {},
    },
  }) as const

const measured = {
  context: { contextWindowSize: 200000 },
  rateLimits: [
    { kind: 'seven_day', percentUsed: 23.5 },
    { kind: 'five_hour', percentUsed: 61 },
  ],
  changed: ['rateLimits'],
} as const

// 使用量 API の応答例（ccusage の説明にある limits 配列の形を想定）
const usageBody = {
  five_hour: null,
  seven_day_opus: null,
  limits: [
    { kind: 'session', percent: 61, resets_at: '2026-10-08T08:10:00Z' },
    { kind: 'weekly_all', percent: 23, resets_at: '2026-10-09T01:00:00Z' },
    {
      kind: 'weekly_scoped',
      percent: 34,
      resets_at: '2026-10-09T01:00:00Z',
      scope: { model: { display_name: 'Fable' } },
    },
  ],
}

// エンジン役: 計測イベント・時計・ログイン情報・HTTP を答える
const engine = (on: On, response: { status: number; text: string } | null) => {
  mock.clock(on, { now: 1_000_000 })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.authorize', () => ({ value: response === null ? null : { handle: 'h', kind: 'bearer' as const } }))
  on('http.fetch', () => ({ value: { status: response?.status ?? 500, ok: true, headers: {}, text: response?.text ?? '' } }))
}

describe('bars', () => {
  test('picks the windows in 5h, W, F order', () => {
    const rows = pickRows(measured.rateLimits, 'fable', { percent: 34, note: '', raw: '' }, 'short')
    expect(rows.map(r => [r.label, r.percent])).toEqual([
      ['5h', 61],
      ['W', 23.5],
      ['F', 34],
    ])
  })

  test('a Fable window from the engine wins over the usage API', () => {
    const rows = pickRows([{ kind: 'seven_day_fable', percentUsed: 9 }], 'fable', { percent: 34, note: '', raw: '' })
    expect(rows[2]?.percent).toBe(9)
  })

  test('a window with no reading is null', () => {
    expect(pickRows([], 'fable').map(r => r.percent)).toEqual([null, null, null])
  })

  test('colors by threshold', () => {
    expect([0, 49, 50, 79, 80, 100].map(colorFor)).toEqual([
      'success',
      'success',
      'warning',
      'warning',
      'error',
      'error',
    ])
  })

  test('fills the bar in proportion, in each style', () => {
    expect(splitBar(50, 4, 'half')).toEqual({ filled: '▄▄', empty: '▁▁' })
    expect(splitBar(50, 4, 'line')).toEqual({ filled: '━━', empty: '──' })
    expect(splitBar(50, 10)).toEqual({ filled: '█████', empty: '░░░░░' })
    expect(splitBar(120, 4).filled).toBe('████')
    expect(splitBar(null, 4).empty).toBe('░░░░')
    expect(percentText(7)).toBe('  7%')
    expect(percentText(null)).toBe(' --%')
  })

  test('describes every window it received', () => {
    const text = describeWindows([{ kind: 'five_hour', percentUsed: 61 }], 'fable', {
      percent: null,
      note: '使用量の応答に「fable」を含む枠がありませんでした',
      raw: '{}',
    })
    expect(text).toMatch(/five_hour: 61%/)
    expect(text).toMatch(/含む枠がありませんでした/)
    expect(text).toMatch(/limit-bars raw/)
    expect(describeWindows([], 'fable')).toMatch(/まだ 1 つも届いていません/)
    expect(describeRaw({ percent: null, note: '', raw: '{"a":1}' })).toMatch(/\{"a":1\}/)
  })
})

describe('fable visibility', () => {
  const rows = pickRows(measured.rateLimits, 'fable')
  const absent = readingFrom(200, JSON.stringify({ limits: [{ kind: 'session', percent: 3 }] }), 'fable')
  const failed = readingFrom(500, 'oops', 'fable')

  test('auto hides Fable only when the usage response has no Fable entry', () => {
    expect(absent.absent).toBe(true)
    expect(visibleRows(rows, 'auto', absent).map(r => r.key)).toEqual(['five-hour', 'weekly'])
    expect(visibleRows(rows, 'auto', failed).map(r => r.key)).toEqual(['five-hour', 'weekly', 'fable'])
    expect(visibleRows(rows, 'auto', null).map(r => r.key)).toEqual(['five-hour', 'weekly', 'fable'])
  })

  test('always and never override the response', () => {
    expect(visibleRows(rows, 'always', absent)).toHaveLength(3)
    expect(visibleRows(rows, 'never', null).map(r => r.key)).toEqual(['five-hour', 'weekly'])
  })

  test('the command says why the Fable bar is hidden', () => {
    expect(describeWindows(measured.rateLimits, 'fable', absent)).toMatch(/Pro プランなど/)
  })
})

describe('usage api', () => {
  test('finds the Fable entry in the limits array', () => {
    expect(findScopedPercent(usageBody, 'fable')).toEqual({ percent: 34, resetsAt: '2026-10-09T01:00:00Z' })
  })

  test('finds a flat seven_day_fable key', () => {
    const body = { five_hour: { utilization: 3 }, seven_day_fable: { utilization: 12.5, resets_at: 'x' } }
    expect(findScopedPercent(body, 'fable')).toEqual({ percent: 12.5, resetsAt: 'x' })
  })

  test('reports why nothing was read', () => {
    expect(readingFrom(401, 'no', 'fable').note).toMatch(/HTTP 401/)
    expect(readingFrom(200, 'not json', 'fable').note).toMatch(/JSON/)
    expect(readingFrom(200, '{"five_hour":{"utilization":3}}', 'fable').percent).toBeNull()
  })
})

test('draws three short half-height bars in one row', async ($, on) => {
  engine(on, { status: 200, text: JSON.stringify(usageBody) })
  await $.session.measure(measured as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(80), surface })
    expect((await ui.find({ key: 'limit-bars' }))?.props.flexDirection).toBe('row')
    expect((await ui.find({ key: 'five-hour' }))?.text).toMatch(/5h ▄+▁+ +61%/)
    expect((await ui.find({ key: 'weekly' }))?.text).toMatch(/W .*24%/)
    expect((await ui.find({ key: 'fable' }))?.text).toMatch(/F .*34%/)
    await ui.unmount()
  }
})

test('asks the usage endpoint with the session credential', async ($, on) => {
  const asked: { url: string; auth?: string }[] = []
  mock.clock(on, { now: 1_000_000 })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.authorize', () => ({ value: { handle: 'secret-handle', kind: 'bearer' as const } }))
  on('http.fetch', (_$, e) => {
    asked.push({ url: e.url, auth: e.init?.auth })

    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(usageBody) } }
  })

  await $.session.measure(measured as never)
  await $.session.measure(measured as never)
  // 2 分以内の 2 回目は問い合わせない
  expect(asked).toEqual([{ url: USAGE_URL, auth: 'secret-handle' }])
})

test('stacks the bars when the row is too narrow', async ($, on) => {
  engine(on, null)
  await $.session.measure(measured as never)
  const narrow = inlineWidth(pickRows([], 'fable', null, 'short'), 8) - 1

  const ui = await $.ui.mount({ ...band(narrow), surface: 'terminal' })
  expect((await ui.find({ key: 'limit-bars' }))?.props.flexDirection).toBe('column')
  await ui.unmount()
})

test('shows placeholders before any reading', async $ => {
  const ui = await $.ui.mount({ ...band(80), surface: 'terminal' })
  expect((await ui.find({ key: 'fable' }))?.text).toMatch(/--%/)
  await ui.unmount()
})

test('a plan without a Fable limit shows only 5h and W', async ($, on) => {
  engine(on, { status: 200, text: JSON.stringify({ limits: [{ kind: 'session', percent: 61 }] }) })
  await $.session.measure(measured as never)

  const ui = await $.ui.mount({ ...band(80), surface: 'terminal' })
  expect(await ui.find({ key: 'five-hour' })).toBeDefined()
  expect(await ui.find({ key: 'weekly' })).toBeDefined()
  expect(await ui.find({ key: 'fable' })).toBeUndefined()
  await ui.unmount()
})

test('showFable always keeps the Fable bar', { options: { showFable: 'always' } }, async ($, on) => {
  engine(on, { status: 200, text: JSON.stringify({ limits: [{ kind: 'session', percent: 61 }] }) })
  await $.session.measure(measured as never)

  const ui = await $.ui.mount({ ...band(80), surface: 'terminal' })
  expect((await ui.find({ key: 'fable' }))?.text).toMatch(/--%/)
  await ui.unmount()
})
