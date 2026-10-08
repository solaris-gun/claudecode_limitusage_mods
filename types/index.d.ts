export type LimitWindow = { kind: string; percentUsed: number; resetsAt?: string }

// 使用量 API（/api/oauth/usage）から読んだ Fable の値と、その取得結果の説明
export type FableReading = { percent: number | null; resetsAt?: string; note: string; raw: string }

declare module 'claude-code' {
  interface PluginState {
    'limit-bars': { windows: LimitWindow[]; fable: FableReading | null }
  }
}
