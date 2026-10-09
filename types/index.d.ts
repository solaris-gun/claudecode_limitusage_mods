export type LimitWindow = { kind: string; percentUsed: number; resetsAt?: string }

// 使用量 API（/api/oauth/usage）から読んだ Fable の値と、その取得結果の説明。
// absent: 応答は正常に読めたが Fable の枠がなかった（Pro プランなど、Fable が上限に含まれないプラン）
export type FableReading = { percent: number | null; resetsAt?: string; absent?: true; note: string; raw: string }

// 今使っているモデルと Effort（モデルへの各リクエストから読む）
export type ModelInfo = { model: string | null; effort: string | null }

declare module 'claude-code' {
  interface PluginState {
    'limit-bars': { windows: LimitWindow[]; fable: FableReading | null; model: ModelInfo }
  }
}
