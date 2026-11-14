import type { PointerEvent as ReactPointerEvent } from 'react'
import { findMedia, useEditor } from '@/features/editor/store/editor-store'
import * as ops from '../model/operations'
import { snapToFrame } from '../model/time'
import type { Micros, Sequence } from '../model/types'
import { SNAP_PX, toTime } from '../components/geometry'

const DRAG_THRESHOLD_PX = 3

function trackIndexAt(seq: Sequence, x: number, y: number): number {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-track-id]')
  return el ? seq.tracks.findIndex((t) => t.id === el.dataset.trackId) : -1
}

/** Ajusta un desplazamiento para que alguno de los bordes caiga en un punto de imantado. */
function snapDelta(edges: Micros[], delta: Micros, points: Micros[], threshold: Micros): { delta: Micros; guide: Micros | null } {
  let best: { delta: Micros; guide: Micros } | null = null
  for (const edge of edges) {
    const hit = ops.nearestSnap(edge + delta, points, threshold)
    if (hit === null) continue
    const candidate = { delta: hit - edge, guide: hit }
    if (!best || Math.abs(candidate.delta - delta) < Math.abs(best.delta - delta)) best = candidate
  }
  return best ?? { delta, guide: null }
}

function track(onMove: (e: PointerEvent) => void, onUp: (e: PointerEvent) => void) {
  const up = (e: PointerEvent) => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    onUp(e)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

export function useClipDrag() {
  const onClipPointerDown = (e: ReactPointerEvent, clipId: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const state = useEditor.getState()
    const { sequence: base, zoom, tool, playhead, magnetic } = state
    const clip = base.clips.find((c) => c.id === clipId)
    if (!clip) return

    if (tool === 'razor') {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      state.splitClipAt(clipId, clip.start + toTime(e.clientX - rect.left, zoom))
      return
    }

    const additive = e.ctrlKey || e.metaKey
    if (additive || !state.selection.includes(clipId)) state.select([clipId], additive)
    const ids = useEditor.getState().selection
    if (!ids.includes(clipId) || ops.isLocked(base, clip.trackId)) return

    const moving = base.clips.filter((c) => ids.includes(c.id))
    const edges = [Math.min(...moving.map((c) => c.start)), Math.max(...moving.map(ops.clipEnd))]
    const points = ops.snapPoints(base, ids, playhead)
    const originRow = base.tracks.findIndex((t) => t.id === clip.trackId)
    const startX = e.clientX
    const startY = e.clientY
    let moved = false

    track(
      (ev) => {
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return
        moved = true
        const { snapping, setPreview, setSnapGuide } = useEditor.getState()
        let delta = toTime(ev.clientX - startX, zoom)
        let guide: Micros | null = null
        if (snapping) ({ delta, guide } = snapDelta(edges, delta, points, toTime(SNAP_PX, zoom)))
        delta = snapToFrame(edges[0] + delta, base.fps) - edges[0]
        const row = trackIndexAt(base, ev.clientX, ev.clientY)
        setSnapGuide(guide)
        setPreview(ops.moveClips(base, ids, delta, row === -1 ? 0 : row - originRow, magnetic))
      },
      () => {
        const { preview, commit, setPreview, setSnapGuide } = useEditor.getState()
        setSnapGuide(null)
        if (moved && preview) commit(preview)
        else setPreview(null)
      }
    )
  }

  const onTrimPointerDown = (e: ReactPointerEvent, clipId: string, edge: 'start' | 'end') => {
    if (e.button !== 0) return
    e.stopPropagation()
    const state = useEditor.getState()
    const { sequence: base, zoom, playhead, magnetic } = state
    const clip = base.clips.find((c) => c.id === clipId)
    if (!clip || ops.isLocked(base, clip.trackId)) return
    state.select([clipId])
    const media = findMedia(state.media, clip.mediaId)
    const origin = edge === 'start' ? clip.start : ops.clipEnd(clip)
    const points = ops.snapPoints(base, [clipId], playhead)
    const startX = e.clientX

    track(
      (ev) => {
        const { snapping, setPreview, setSnapGuide } = useEditor.getState()
        let t = origin + toTime(ev.clientX - startX, zoom)
        const hit = snapping ? ops.nearestSnap(t, points, toTime(SNAP_PX, zoom)) : null
        t = hit ?? snapToFrame(t, base.fps)
        setSnapGuide(hit)
        setPreview(ops.applyMagnetic(ops.trimClip(base, clipId, edge, t, media), magnetic))
      },
      () => {
        const { preview, commit, setSnapGuide } = useEditor.getState()
        setSnapGuide(null)
        if (preview) commit(preview)
      }
    )
  }

  return { onClipPointerDown, onTrimPointerDown }
}

/** Arrastre del cabezal sobre la regla. */
export function startScrub(e: ReactPointerEvent, originLeft: () => number) {
  if (e.button !== 0) return
  const { zoom, setPlayhead, setPlaying } = useEditor.getState()
  setPlaying(false)
  const at = (x: number) => setPlayhead(toTime(x - originLeft(), zoom))
  at(e.clientX)
  track(
    (ev) => at(ev.clientX),
    () => undefined
  )
}
