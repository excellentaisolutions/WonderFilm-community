import { create } from 'zustand'

interface Decision {
  kind: 'close' | 'replace'
  proceed: () => void
}
export const useProjectDecision = create<{ pending: Decision | null }>(() => ({ pending: null }))
export function requestProjectDecision(kind: Decision['kind'], proceed: () => void): void {
  if (!useProjectDecision.getState().pending) useProjectDecision.setState({ pending: { kind, proceed } })
}
export function dismissProjectDecision(): void {
  useProjectDecision.setState({ pending: null })
}
