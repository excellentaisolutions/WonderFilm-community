import { SECOND, type Micros, type TrackKind } from '../model/types'

export const HEADER_WIDTH = 184
export const RULER_HEIGHT = 28
export const SNAP_PX = 8
export const TAIL_SECONDS = 30

export const trackHeight = (kind: TrackKind): number => (kind === 'visual' ? 62 : 50)

export const toPx = (t: Micros, zoom: number): number => (t / SECOND) * zoom
export const toTime = (px: number, zoom: number): Micros => Math.round((px / zoom) * SECOND)

const STEPS = [0.04, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

/** Intervalo de la regla: el más pequeño que deja al menos 90 px entre marcas principales. */
export function rulerStep(zoom: number): number {
  return STEPS.find((s) => s * zoom >= 90) ?? STEPS[STEPS.length - 1]
}
