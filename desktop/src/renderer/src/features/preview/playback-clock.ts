import type { Clip } from '../timeline/model/types'
import { clipEnd } from '../timeline/model/operations'
const clocks = new Map<HTMLMediaElement, Clip>()
let lastMaster: HTMLMediaElement | undefined
let lastPosition = 0
let lastAdvance = 0

export function registerPlaybackClock(element: HTMLMediaElement, clip: Clip) {
  clocks.set(element, clip)
  return () => { clocks.delete(element) }
}

/** El audio es la referencia; el reloj de pared solo avanza huecos sin medios. */
export function playbackTime(playhead: number): number | undefined {
  const entries = [...clocks].sort(([a], [b]) => Number(b.tagName === 'AUDIO') - Number(a.tagName === 'AUDIO'))
  for (const [element, clip] of entries) {
    if (element.paused || element.seeking || element.readyState < 2 || playhead < clip.start || playhead >= clipEnd(clip)) continue
    const position = clip.start + (element.currentTime * 1_000_000 - clip.sourceIn) / clip.speed
    // Un seek aún pendiente no debe saltar la línea de tiempo hacia una posición vieja.
    if (Math.abs(position - playhead) >= 500_000) continue
    const now = performance.now()
    if (lastMaster !== element || position !== lastPosition) lastAdvance = now
    lastMaster = element
    lastPosition = position
    const buffering = element.readyState < 3 || now - lastAdvance > 100
    // También sincronizar cuando el reloj maestro se detiene: React no vuelve a
    // ejecutar efectos si el cabezal conserva el mismo valor durante buffering.
    for (const [slave, other] of entries) {
      if (slave === element || playhead < other.start || playhead >= clipEnd(other)) continue
      const target = (other.sourceIn + (position - other.start) * other.speed) / 1_000_000
      if (!slave.seeking && Math.abs(slave.currentTime - target) > .04 * other.speed) slave.currentTime = Math.max(0, target)
      if (buffering) { if (!slave.paused) slave.pause() }
      else if (slave.paused && slave.readyState >= 2) void slave.play().catch(() => undefined)
    }
    return position
  }
  return undefined
}
