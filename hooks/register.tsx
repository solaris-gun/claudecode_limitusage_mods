import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LimitWindow } from '../types'
import {
  SEGMENT_GAP,
  cellWidth,
  clampWidth,
  colorFor,
  describeWindows,
  isInline,
  padLabel,
  percentText,
  pickRows,
  splitBar,
  toLayout,
} from './bars'

const windows = atom({ plugin: 'limit-bars', key: 'windows' } as const, [])

const toWindows = (limits: readonly LimitWindow[]): LimitWindow[] =>
  limits.map(({ kind, percentUsed, resetsAt }) =>
    resetsAt === undefined ? { kind, percentUsed } : { kind, percentUsed, resetsAt },
  )

export const register: Register = (on, options) => {
  const barWidth = clampWidth(options.barWidth)
  const layout = toLayout(options.layout)
  const fableWindow = typeof options.fableWindow === 'string' ? options.fableWindow : 'fable'

  // 起動直後（リロード後も含む）に、その時点の数値を取り込む
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'limit-bars',
      description: 'Claude Code から届いているレートリミットの枠の名前と使用率を一覧表示する',
    })
    const { rateLimits } = await $.session.usage()
    await update($, windows, () => toWindows(rateLimits))

    return result
  })

  on('command.run', { command: 'limit-bars' }, async $ => {
    const { rateLimits } = await $.session.usage()
    const latest = toWindows(rateLimits)
    await update($, windows, () => latest)

    return { text: describeWindows(latest, fableWindow) }
  })

  // API 応答ごと・枠が 1 ポイント動くごとにエンジンから届く
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, windows, () => toWindows(e.rateLimits))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const rows = pickRows(await read($, windows), fableWindow)
    const inline = isInline(layout, rows, barWidth, e.props.bodyColumns)
    const labelCells = inline ? 0 : Math.max(...rows.map(r => cellWidth(r.label)))

    const segments = rows.map(row => {
      const { filled, empty } = splitBar(row.percent, barWidth)
      const color = row.percent === null ? undefined : colorFor(row.percent)

      return (
        <Box key={row.key} flexDirection="row">
          <Text bold>{inline ? row.label : padLabel(row.label, labelCells)} </Text>
          <Text color={color}>{filled}</Text>
          <Text dimColor>{empty}</Text>
          <Text color={color} dimColor={color === undefined} bold={color === 'error'}>
            {' '}
            {percentText(row.percent)}
          </Text>
        </Box>
      )
    })

    return (
      <Box key="limit-bars" flexDirection={inline ? 'row' : 'column'} columnGap={SEGMENT_GAP}>
        {segments}
      </Box>
    )
  })
}
