import { SECOND, type Micros, type Rational } from './types'

export function frameDuration(fps: Rational): Micros {
  return (SECOND * fps.den) / fps.num
}

/** Ajusta al fotograma más cercano. */
export function snapToFrame(t: Micros, fps: Rational): Micros {
  const frame = frameDuration(fps)
  return Math.round(Math.round(t / frame) * frame)
}

export function fpsLabel(fps: Rational): string {
  const value = fps.num / fps.den
  return Number.isInteger(value) ? `${value}` : value.toFixed(2)
}

/** HH:MM:SS:FF, con el número de fotograma según la cadencia de la secuencia. */
export function formatTimecode(t: Micros, fps: Rational): string {
  const safe = Math.max(0, t)
  const totalFrames = Math.round(safe / frameDuration(fps))
  const perSecond = Math.round(fps.num / fps.den)
  const frames = totalFrames % perSecond
  const totalSeconds = Math.floor(totalFrames / perSecond)
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60) % 60
  const h = Math.floor(totalSeconds / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(frames)}`
}

export function formatShort(t: Micros): string {
  const totalSeconds = Math.floor(Math.max(0, t) / SECOND)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
