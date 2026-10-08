import type { LimitWindow } from '../types'

export type BarRow = {
  key: string
  label: string
  percent: number | null
}

export type Layout = 'auto' | 'inline' | 'stacked'

const FILLED = '█'
const EMPTY = '░'

// 表示順は 5時間 → Weekly → Fable
export function pickRows(windows: readonly LimitWindow[], fableWindow: string): BarRow[] {
  const needle = fableWindow.toLowerCase()
  const find = (match: (kind: string) => boolean) =>
    windows.find(w => match(w.kind.toLowerCase()))?.percentUsed ?? null

  return [
    { key: 'five-hour', label: '5時間', percent: find(k => k === 'five_hour') },
    { key: 'weekly', label: 'Weekly', percent: find(k => k === 'seven_day') },
    {
      key: 'fable',
      label: 'Fable',
      percent: needle === '' ? null : find(k => k.includes(needle)),
    },
  ]
}

export function clampWidth(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 12

  return Math.min(40, Math.max(4, n))
}

export function toLayout(value: unknown): Layout {
  return value === 'inline' || value === 'stacked' ? value : 'auto'
}

// 0〜49% 緑、50〜79% 黄、80% 以上 赤（テーマの色に従う）
export function colorFor(percent: number): 'success' | 'warning' | 'error' {
  if (percent >= 80) {
    return 'error'
  }

  return percent >= 50 ? 'warning' : 'success'
}

export function splitBar(percent: number | null, width: number): { filled: string; empty: string } {
  const ratio = percent === null ? 0 : Math.min(100, Math.max(0, percent)) / 100
  const cells = Math.round(ratio * width)

  return { filled: FILLED.repeat(cells), empty: EMPTY.repeat(width - cells) }
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

const GAP = 3

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

// /limit-bars コマンドの出力: Claude Code から届いている枠をそのまま並べる
export function describeWindows(windows: readonly LimitWindow[], fableWindow: string): string {
  if (windows.length === 0) {
    return [
      'レートリミットの数値がまだ 1 つも届いていません。',
      '・起動直後なら、何か 1 回やり取りしてから再度実行してください',
      '・API キーで利用している場合は数値が届きません（サブスクリプションでのログインが必要です）',
    ].join('\n')
  }

  const lines = windows.map(w => {
    const reset = w.resetsAt === undefined ? '' : `（リセット: ${w.resetsAt}）`

    return `・${w.kind}: ${w.percentUsed}%${reset}`
  })
  const fable = pickRows(windows, fableWindow)[2]?.percent ?? null
  const note =
    fable === null
      ? `Fable 枠の識別子「${fableWindow}」を含む枠はありません。上の一覧に Fable の枠があれば、その名前を教えてください。`
      : `Fable のバーには「${fableWindow}」を含む枠の値（${fable}%）を表示しています。`

  return ['Claude Code から届いているレートリミットの枠:', ...lines, '', note].join('\n')
}
