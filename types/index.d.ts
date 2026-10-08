export type LimitWindow = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'limit-bars': { windows: LimitWindow[] }
  }
}
