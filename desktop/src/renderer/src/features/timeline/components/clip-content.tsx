import { memo, useEffect, useState } from 'react'
import type { Clip, MediaItem } from '../model/types'
import { SECOND } from '../model/types'
import { mediaUrl } from '../../../../../shared/contracts'

const TILE_W = 96
const TILE_H = 54
const PEAKS_PER_SECOND = 50

/** Tira de fotogramas reales: cada casilla muestra el fotograma de la fuente que le toca. */
export const Filmstrip = memo(function Filmstrip({ clip, media, width, zoom }: { clip: Clip; media: MediaItem; width: number; zoom: number }) {
  const strip = media.source?.strip
  const thumb = media.source?.thumbPath
  if (!strip && thumb) {
    return <div className="absolute inset-0 opacity-90" style={{ backgroundImage: `url("${mediaUrl(thumb)}")`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }} />
  }
  if (!strip) return null
  const url = mediaUrl(strip.path)
  const tiles = Math.ceil(width / TILE_W)
  return (
    <div className="absolute inset-0 flex overflow-hidden opacity-90">
      {Array.from({ length: tiles }, (_, i) => {
        const sourceSec = clip.sourceIn / SECOND + (((i + 0.5) * TILE_W) / zoom) * clip.speed
        const frame = Math.max(0, Math.min(strip.frames - 1, Math.floor(sourceSec / strip.interval)))
        return (
          <div
            key={i}
            className="h-full shrink-0 border-r border-black/40"
            style={{ width: TILE_W, backgroundImage: `url("${url}")`, backgroundPosition: `-${frame * TILE_W}px center`, backgroundSize: `${strip.frames * TILE_W}px ${TILE_H}px`, backgroundRepeat: 'no-repeat' }}
          />
        )
      })}
    </div>
  )
})

const cache = new Map<string, Promise<number[]>>()

function loadPeaks(path: string): Promise<number[]> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(mediaUrl(path))
      .then((r) => (r.ok ? (r.json() as Promise<number[]>) : []))
      .catch(() => [])
    cache.set(path, p)
  }
  return p
}

/** Forma de onda real del tramo que usa el clip. */
export const RealWaveform = memo(function RealWaveform({ clip, media, width, className }: { clip: Clip; media: MediaItem; width: number; className?: string }) {
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const path = media.source?.peaksPath
  useEffect(() => {
    if (!path) return
    let alive = true
    void loadPeaks(path).then((p) => alive && setPeaks(p))
    return () => {
      alive = false
    }
  }, [path])
  if (!peaks?.length) return null

  const bars = Math.max(4, Math.floor(width / 3))
  const from = (clip.sourceIn / SECOND) * PEAKS_PER_SECOND
  const to = (clip.sourceOut / SECOND) * PEAKS_PER_SECOND
  const per = (to - from) / bars
  const heights = Array.from({ length: bars }, (_, i) => {
    const a = Math.floor(from + i * per)
    const b = Math.max(a + 1, Math.floor(from + (i + 1) * per))
    let max = 0
    for (let k = a; k < b && k < peaks.length; k++) max = Math.max(max, peaks[k])
    return Math.max(2, max) / 100
  })
  return (
    <svg viewBox={`0 0 ${bars * 3} 40`} preserveAspectRatio="none" className={className} aria-hidden="true">
      {heights.map((v, i) => (
        <rect key={i} x={i * 3} y={20 - v * 19} width={2} height={v * 38} rx={1} fill="currentColor" />
      ))}
    </svg>
  )
})
