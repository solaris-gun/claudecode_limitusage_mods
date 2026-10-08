import { describe, expect, test } from 'claude-code/testing'

import { colorFor, describeWindows, inlineWidth, percentText, pickRows, splitBar } from '../hooks/bars'

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
    { kind: 'seven_day_fable', percentUsed: 92.4 },
  ],
  changed: ['rateLimits'],
} as const

describe('bars', () => {
  test('picks the windows in 5時間, Weekly, Fable order', () => {
    const rows = pickRows(measured.rateLimits, 'fable')
    expect(rows.map(r => [r.label, r.percent])).toEqual([
      ['5時間', 61],
      ['Weekly', 23.5],
      ['Fable', 92.4],
    ])
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

  test('fills the bar in proportion and clamps', () => {
    expect(splitBar(50, 10)).toEqual({ filled: '█████', empty: '░░░░░' })
    expect(splitBar(120, 4).filled).toBe('████')
    expect(splitBar(null, 4).empty).toBe('░░░░')
    expect(percentText(7)).toBe('  7%')
    expect(percentText(null)).toBe(' --%')
  })

  test('describes every window it received', () => {
    const text = describeWindows([{ kind: 'five_hour', percentUsed: 61 }, { kind: 'seven_day_opus', percentUsed: 5 }], 'fable')
    expect(text).toMatch(/five_hour: 61%/)
    expect(text).toMatch(/seven_day_opus: 5%/)
    expect(text).toMatch(/「fable」を含む枠はありません/)
    expect(describeWindows(measured.rateLimits, 'fable')).toMatch(/92.4%/)
    expect(describeWindows([], 'fable')).toMatch(/まだ 1 つも届いていません/)
  })
})

test('draws three bars in one row once the limits arrive', async ($, on) => {
  // エンジン役として計測イベントに応答し、MOD が値を取り込むことを確かめる
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.measure(measured as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(120), surface })
    const root = await ui.find({ key: 'limit-bars' })
    expect(root?.props.flexDirection).toBe('row')
    expect((await ui.find({ key: 'weekly' }))?.text).toMatch(/Weekly.*24%/)
    expect((await ui.find({ key: 'five-hour' }))?.text).toMatch(/5時間.*61%/)
    expect((await ui.find({ key: 'fable' }))?.text).toMatch(/Fable.*92%/)
    await ui.unmount()
  }
})

test('stacks the bars when the row is too narrow', async ($, on) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.measure(measured as never)
  const narrow = inlineWidth(pickRows([], 'fable'), 12) - 1

  const ui = await $.ui.mount({ ...band(narrow), surface: 'terminal' })
  expect((await ui.find({ key: 'limit-bars' }))?.props.flexDirection).toBe('column')
  await ui.unmount()
})

test('shows placeholders before any reading', async $ => {
  const ui = await $.ui.mount({ ...band(120), surface: 'terminal' })
  expect((await ui.find({ key: 'weekly' }))?.text).toMatch(/--%/)
  await ui.unmount()
})
