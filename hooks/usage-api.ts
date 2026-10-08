import type { FableReading } from '../types'

// Claude Code の /usage と同じ取得先。公式ドキュメントのない窓口なので、形が変わっても壊れないように探す
export const USAGE_BETA = 'oauth-2025-04-20'
export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const RAW_LIMIT = 4000

type Found = { percent: number; resetsAt?: string }

const toNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const mentions = (node: unknown, needle: string): boolean =>
  JSON.stringify(node ?? null).toLowerCase().includes(needle)

// 使用率（percent / utilization）を持つ一番内側の要素のうち、キー名か中身が needle を含むもの
export function findScopedPercent(body: unknown, needle: string): Found | null {
  if (needle === '') {
    return null
  }

  const walk = (node: unknown, key: string): Found | null => {
    if (node === null || typeof node !== 'object') {
      return null
    }

    const children = Array.isArray(node) ? node.map(v => [key, v] as const) : Object.entries(node)
    for (const [childKey, child] of children) {
      const found = walk(child, String(childKey))
      if (found !== null) {
        return found
      }
    }

    if (Array.isArray(node)) {
      return null
    }

    const record = node as Record<string, unknown>
    const percent = toNumber(record.percent) ?? toNumber(record.utilization)
    if (percent === null || !(key.toLowerCase().includes(needle) || mentions(record, needle))) {
      return null
    }

    const resetsAt = record.resets_at ?? record.resetsAt

    return typeof resetsAt === 'string' ? { percent, resetsAt } : { percent }
  }

  return walk(body, '')
}

export function readingFrom(status: number, text: string, needle: string): FableReading {
  const raw = text.slice(0, RAW_LIMIT)
  if (status < 200 || status >= 300) {
    return { percent: null, note: `使用量の取得に失敗しました（HTTP ${status}）`, raw }
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { percent: null, note: '使用量の応答を JSON として読めませんでした', raw }
  }

  const found = findScopedPercent(body, needle)
  if (found === null) {
    return { percent: null, note: `使用量の応答に「${needle}」を含む枠がありませんでした`, raw }
  }

  return { ...found, note: `使用量の応答から取得しました（${found.percent}%）`, raw }
}

export function failedReading(note: string): FableReading {
  return { percent: null, note, raw: '' }
}
