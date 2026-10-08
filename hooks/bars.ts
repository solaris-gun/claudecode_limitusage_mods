import type { FableReading, LimitWindow } from '../types'

export type BarRow = {
  key: string
  label: string
  percent: number | null
}

export type Layout = 'auto' | 'inline' | 'stacked'
export type BarStyle = 'half' | 'line' | 'block'
export type LabelStyle = 'short' | 'long'

// 埋まった部分と空き部分の文字。half はマスの下半分だけを塗るので背が低く見える
const GLYPHS: Record<BarStyle, { filled: string; empty: string }> = {
  half: { filled: '▄', empty: '▁' },
  line: { filled: '━', empty: '─' },
  block: { filled: '█', empty: '░' },
}

const LABELS: Record<LabelStyle, readonly [string, string, string]> = {
  short: ['5h', 'W', 'F'],
  long: ['5時間', 'Weekly', 'Fable'],
}

// 表示順は 5時間 → Weekly → Fable。Fable はエンジンの枠になければ使用量 API の値を使う
export function pickRows(
  windows: readonly LimitWindow[],
  fableWindow: string,
  fable: FableReading | null = null,
  labelStyle: LabelStyle = 'long',
): BarRow[] {
  const needle = fableWindow.toLowerCase()
  const find = (match: (kind: string) => boolean) =>
    windows.find(w => match(w.kind.toLowerCase()))?.percentUsed ?? null
  const [fiveHour, weekly, fableLabel] = LABELS[labelStyle]
  const fableFromWindows = needle === '' ? null : find(k => k.includes(needle))

  return [
    { key: 'five-hour', label: fiveHour, percent: find(k => k === 'five_hour') },
    { key: 'weekly', label: weekly, percent: find(k => k === 'seven_day') },
    { key: 'fable', label: fableLabel, percent: fableFromWindows ?? fable?.percent ?? null },
  ]
}

export function clampWidth(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 8

  return Math.min(40, Math.max(4, n))
}

export function toLayout(value: unknown): Layout {
  return value === 'inline' || value === 'stacked' ? value : 'auto'
}

export function toBarStyle(value: unknown): BarStyle {
  return value === 'line' || value === 'block' ? value : 'half'
}

export function toLabelStyle(value: unknown): LabelStyle {
  return value === 'long' ? 'long' : 'short'
}

// 0〜49% 緑、50〜79% 黄、80% 以上 赤（テーマの色に従う）
export function colorFor(percent: number): 'success' | 'warning' | 'error' {
  if (percent >= 80) {
    return 'error'
  }

  return percent >= 50 ? 'warning' : 'success'
}

export function splitBar(
  percent: number | null,
  width: number,
  style: BarStyle = 'block',
): { filled: string; empty: string } {
  const ratio = percent === null ? 0 : Math.min(100, Math.max(0, percent)) / 100
  const cells = Math.round(ratio * width)
  const glyphs = GLYPHS[style]

  return { filled: glyphs.filled.repeat(cells), empty: glyphs.empty.repeat(width - cells) }
}

export function percentText(percent: number | null): string {
  return (percent === null ? '--%' : `${Math.round(percent)}%`).padStart(4)
}

// 全角文字を 2 セルとして数える（ラベルの桁揃え用）
export function cellWidth(text: string): number {
  let cells = 0
  for (const ch of text) {
    cells += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1
  }

  return cells
}

export function padLabel(label: string, cells: number): string {
  return label + ' '.repeat(Math.max(0, cells - cellWidth(label)))
}

const GAP = 2

// 横一列に並べたときの全体幅
export function inlineWidth(rows: readonly BarRow[], barWidth: number): number {
  const segments = rows.map(r => cellWidth(r.label) + 1 + barWidth + 1 + 4)

  return segments.reduce((a, b) => a + b, 0) + GAP * (rows.length - 1)
}

export function isInline(layout: Layout, rows: readonly BarRow[], barWidth: number, columns: number): boolean {
  if (layout !== 'auto') {
    return layout === 'inline'
  }

  return inlineWidth(rows, barWidth) <= columns
}

export const SEGMENT_GAP = GAP

// /limit-bars コマンドの出力: Claude Code から届いている枠と、使用量 API の取得結果を並べる
export function describeWindows(
  windows: readonly LimitWindow[],
  fableWindow: string,
  fable: FableReading | null = null,
): string {
  const lines =
    windows.length === 0
      ? [
          'レートリミットの数値がまだ 1 つも届いていません。',
          '・起動直後なら、何か 1 回やり取りしてから再度実行してください',
          '・API キーで利用している場合は数値が届きません（サブスクリプションでのログインが必要です）',
        ]
      : [
          'Claude Code から届いているレートリミットの枠:',
          ...windows.map(w => {
            const reset = w.resetsAt === undefined ? '' : `（リセット: ${w.resetsAt}）`

            return `・${w.kind}: ${w.percentUsed}%${reset}`
          }),
        ]
  const percent = pickRows(windows, fableWindow, fable)[2]?.percent ?? null
  const note =
    percent === null
      ? `Fable の使用率は見つかりませんでした。「/limit-bars raw」で使用量の応答をそのまま表示できます。`
      : `Fable のバーには ${percent}% を表示しています。`

  return [...lines, '', `Fable（使用量 API）: ${fable?.note ?? 'まだ取得していません'}`, note].join('\n')
}

export function describeRaw(fable: FableReading | null): string {
  if (fable === null || fable.raw === '') {
    return `使用量の応答はまだありません。${fable === null ? '' : fable.note}`
  }

  return ['使用量 API の応答（先頭 4000 文字）:', fable.raw].join('\n')
}
