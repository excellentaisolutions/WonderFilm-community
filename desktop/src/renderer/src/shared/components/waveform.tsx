import { useMemo } from 'react'
import { seeded } from '@/shared/lib/seeded'

export function Waveform({ seed, bars = 48, className }: { seed: string; bars?: number; className?: string }) {
  const heights = useMemo(() => {
    const rand = seeded(seed)
    let level = 0.5
    return Array.from({ length: bars }, () => {
      level = Math.min(1, Math.max(0.12, level + (rand() - 0.5) * 0.5))
      return level
    })
  }, [seed, bars])
  return (
    <svg viewBox={`0 0 ${bars * 4} 40`} preserveAspectRatio="none" className={className} aria-hidden="true">
      {heights.map((v, i) => (
        <rect key={i} x={i * 4} y={20 - v * 18} width={2.4} height={v * 36} rx={1} fill="currentColor" />
      ))}
    </svg>
  )
}
