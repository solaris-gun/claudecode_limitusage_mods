import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LimitWindow } from '../types'
import {
  SEGMENT_GAP,
  cellWidth,
  clampWidth,
  colorFor,
  describeRaw,
  describeWindows,
  isInline,
  padLabel,
  percentText,
  pickRows,
  splitBar,
  visibleRows,
  toBarStyle,
  toLabelStyle,
  toShowFable,
  toLayout,
} from './bars'
import { USAGE_BETA, USAGE_URL, failedReading, readingFrom } from './usage-api'

const windows = atom({ plugin: 'limit-bars', key: 'windows' } as const, [])
const fable = atom({ plugin: 'limit-bars', key: 'fable' } as const, null)

// 使用量 API へ問い合わせる最短間隔
const FETCH_INTERVAL_MS = 2 * 60 * 1000

const toWindows = (limits: readonly LimitWindow[]): LimitWindow[] =>
  limits.map(({ kind, percentUsed, resetsAt }) =>
    resetsAt === undefined ? { kind, percentUsed } : { kind, percentUsed, resetsAt },
  )

let lastFetchAt: number | null = null

// Claude Code が MOD に渡す枠には Fable がないため、/usage と同じ取得先に問い合わせる
async function refreshFable($: EngineInterface, enabled: boolean, fableWindow: string, force: boolean) {
  const now = await $.clock.now()
  if (!enabled || (!force && lastFetchAt !== null && now - lastFetchAt < FETCH_INTERVAL_MS)) {
    return
  }

  lastFetchAt = now
  const authorization = await $.session.authorize()
  if (authorization === null) {
    await update($, fable, () => failedReading('Anthropic のログイン情報がないため、使用量を取得できません'))

    return
  }

  try {
    const response = await $.http.fetch(USAGE_URL, {
      headers: { 'anthropic-beta': USAGE_BETA },
      auth: authorization.handle,
    })
    await update($, fable, () => readingFrom(response.status, response.text, fableWindow.toLowerCase()))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await update($, fable, () => failedReading(`使用量の取得に失敗しました（${reason}）`))
  }
}

export const register: Register = (on, options) => {
  const barWidth = clampWidth(options.barWidth)
  const layout = toLayout(options.layout)
  const barStyle = toBarStyle(options.barStyle)
  const labelStyle = toLabelStyle(options.labelStyle)
  const fableWindow = typeof options.fableWindow === 'string' ? options.fableWindow : 'fable'
  const fetchUsage = options.fetchUsage !== false
  const showFable = toShowFable(options.showFable)

  // 起動直後（リロード後も含む）に、その時点の数値を取り込む
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'limit-bars',
      description: 'レートリミットの枠と Fable の取得結果を一覧表示する（raw で使用量の応答を表示）',
      argumentHint: '[raw]',
    })
    const { rateLimits } = await $.session.usage()
    await update($, windows, () => toWindows(rateLimits))
    await refreshFable($, fetchUsage, fableWindow, true)

    return result
  })

  on('command.run', { command: 'limit-bars' }, async ($, e) => {
    const { rateLimits } = await $.session.usage()
    const latest = toWindows(rateLimits)
    await update($, windows, () => latest)
    await refreshFable($, fetchUsage, fableWindow, true)
    const reading = await read($, fable)

    if (!fetchUsage) {
      return { text: describeWindows(latest, fableWindow, null) + '\n（使用量 API からの取得は設定でオフになっています）' }
    }

    return { text: e.args.trim() === 'raw' ? describeRaw(reading) : describeWindows(latest, fableWindow, reading) }
  })

  // API 応答ごと・枠が 1 ポイント動くごとにエンジンから届く
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, windows, () => toWindows(e.rateLimits))
      await refreshFable($, fetchUsage, fableWindow, false)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const reading = await read($, fable)
    const rows = visibleRows(pickRows(await read($, windows), fableWindow, reading, labelStyle), showFable, reading)
    const inline = isInline(layout, rows, barWidth, e.props.bodyColumns)
    const labelCells = inline ? 0 : Math.max(...rows.map(r => cellWidth(r.label)))

    const segments = rows.map(row => {
      const { filled, empty } = splitBar(row.percent, barWidth, barStyle)
      const color = row.percent === null ? undefined : colorFor(row.percent)

      return (
        <Box key={row.key} flexDirection="row">
          <Text dimColor>{inline ? row.label : padLabel(row.label, labelCells)} </Text>
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
