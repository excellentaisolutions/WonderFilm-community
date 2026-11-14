import { frameDuration } from './time'
import { DEFAULT_TRANSFORM, SECOND, type Clip, type MediaItem, type Micros, type Sequence, type Track, type TrackKind } from './types'

/** Duración inicial de imágenes y textos. */
export const STILL_DURATION: Micros = 5 * SECOND
export const DEFAULT_TRANSITION: Micros = SECOND

export const newId = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

export function clipDuration(c: Clip): Micros {
  return Math.round((c.sourceOut - c.sourceIn) / c.speed)
}

export function clipEnd(c: Clip): Micros {
  return c.start + clipDuration(c)
}

export function sequenceDuration(seq: Sequence): Micros {
  return seq.clips.reduce((max, c) => Math.max(max, clipEnd(c)), 0)
}

/** La pista principal es la visual más baja. */
export function mainTrackId(seq: Sequence): string | undefined {
  return seq.tracks.filter((t) => t.kind === 'visual').at(-1)?.id
}

export function trackOf(seq: Sequence, trackId: string): Track | undefined {
  return seq.tracks.find((t) => t.id === trackId)
}

export function isLocked(seq: Sequence, trackId: string): boolean {
  return trackOf(seq, trackId)?.locked ?? true
}

export function trackKindFor(kind: MediaItem['kind']): TrackKind {
  return kind === 'audio' ? 'audio' : 'visual'
}

const byStart = (a: Clip, b: Clip) => a.start - b.start

function clipsOn(clips: Clip[], trackId: string): Clip[] {
  return clips.filter((c) => c.trackId === trackId).sort(byStart)
}

function trimEndTo(c: Clip, t: Micros): Clip {
  return { ...c, sourceOut: Math.round(c.sourceIn + (t - c.start) * c.speed), transitionOut: undefined }
}

function trimStartTo(c: Clip, t: Micros): Clip {
  return { ...c, start: t, sourceIn: Math.round(c.sourceIn + (t - c.start) * c.speed) }
}

/** Lo que queda de `c` tras liberar el intervalo [s, e): 0, 1 o 2 trozos. */
function carve(c: Clip, s: Micros, e: Micros): Clip[] {
  const cs = c.start
  const ce = clipEnd(c)
  if (ce <= s || cs >= e) return [c]
  const pieces: Clip[] = []
  if (cs < s) pieces.push(trimEndTo(c, s))
  if (ce > e) pieces.push(trimStartTo(pieces.length ? { ...c, id: newId('clip') } : c, e))
  return pieces
}

function compact(trackClips: Clip[]): Clip[] {
  let t = 0
  return trackClips.map((c) => {
    const placed = { ...c, start: t }
    t = clipEnd(placed)
    return placed
  })
}

/**
 * Resuelve los solapes que producen los clips recién colocados.
 * En pistas normales, el clip colocado manda y recorta lo que tapa.
 * En la pista principal con modo magnético, se inserta y la pista se compacta.
 */
export function placeClips(seq: Sequence, placedIds: string[], magnetic: boolean): Sequence {
  const placed = new Set(placedIds)
  const main = mainTrackId(seq)
  let clips = seq.clips

  const others = clips.filter((c) => !placed.has(c.id))
  const movers = clips.filter((c) => placed.has(c.id))

  let rest: Clip[] = others
  for (const m of movers) {
    if (magnetic && m.trackId === main) continue
    const s = m.start
    const e = clipEnd(m)
    rest = rest.flatMap((c) => (c.trackId === m.trackId ? carve(c, s, e) : [c]))
  }
  clips = [...rest, ...movers]

  if (magnetic && main) {
    const mainMovers = movers.filter((c) => c.trackId === main).sort(byStart)
    const mainRest = clipsOn(rest, main)
    let ordered: Clip[]
    if (mainMovers.length) {
      const at = mainMovers[0].start
      const idx = mainRest.filter((c) => c.start + clipDuration(c) / 2 < at).length
      ordered = [...mainRest.slice(0, idx), ...mainMovers, ...mainRest.slice(idx)]
    } else {
      ordered = mainRest
    }
    clips = [...clips.filter((c) => c.trackId !== main), ...compact(ordered)]
  }
  return { ...seq, clips }
}

/** Compacta la pista principal si el modo magnético está activo. */
export function applyMagnetic(seq: Sequence, magnetic: boolean): Sequence {
  return magnetic ? placeClips(seq, [], true) : seq
}

/** Dividir: con selección, solo esos clips; sin ella, todos los que estén bajo el cabezal. */
export function splitAt(seq: Sequence, t: Micros, selectedIds: string[] = []): { seq: Sequence; created: string[] } {
  const selected = new Set(selectedIds)
  const created: string[] = []
  const clips = seq.clips.flatMap((c) => {
    if (isLocked(seq, c.trackId)) return [c]
    if (selected.size && !selected.has(c.id)) return [c]
    if (t <= c.start || t >= clipEnd(c)) return [c]
    // Cada mitad conserva solo el fundido de su extremo exterior: no se oye un fundido en el corte.
    const right = { ...trimStartTo({ ...c, id: newId('clip') }, t), transitionOut: c.transitionOut, fadeIn: undefined }
    created.push(right.id)
    return [{ ...trimEndTo(c, t), fadeOut: undefined }, right]
  })
  return { seq: { ...seq, clips }, created }
}

/** Recortar: limitado por la fuente, por los vecinos y por un fotograma mínimo. */
export function trimClip(
  seq: Sequence,
  clipId: string,
  edge: 'start' | 'end',
  time: Micros,
  media: MediaItem | undefined
): Sequence {
  const c = seq.clips.find((x) => x.id === clipId)
  if (!c || isLocked(seq, c.trackId)) return seq
  const minDur = Math.round(frameDuration(seq.fps))
  const neighbours = clipsOn(seq.clips, c.trackId).filter((x) => x.id !== c.id)
  const end = clipEnd(c)
  const hasSource = media?.duration != null

  let next: Clip
  if (edge === 'end') {
    const wall = Math.min(...neighbours.filter((x) => x.start >= end).map((x) => x.start), Infinity)
    let newEnd = Math.min(Math.max(time, c.start + minDur), wall)
    if (hasSource) newEnd = Math.min(newEnd, c.start + Math.round((media!.duration! - c.sourceIn) / c.speed))
    next = { ...c, sourceOut: Math.round(c.sourceIn + (newEnd - c.start) * c.speed) }
  } else {
    const wall = Math.max(...neighbours.filter((x) => clipEnd(x) <= c.start).map(clipEnd), 0)
    let newStart = Math.max(Math.min(time, end - minDur), wall)
    if (hasSource) newStart = Math.max(newStart, c.start - Math.round(c.sourceIn / c.speed))
    next = hasSource
      ? trimStartTo(c, newStart)
      : { ...c, start: newStart, sourceIn: 0, sourceOut: Math.round((end - newStart) * c.speed) }
  }
  return { ...seq, clips: seq.clips.map((x) => (x.id === clipId ? next : x)) }
}

/** Mover. `trackShift` cuenta filas en la lista de pistas; si alguna no encaja, no se cambia de pista. */
export function moveClips(seq: Sequence, ids: string[], delta: Micros, trackShift: number, magnetic: boolean): Sequence {
  const moving = seq.clips.filter((c) => ids.includes(c.id) && !isLocked(seq, c.trackId))
  if (!moving.length) return seq
  const safeDelta = Math.max(delta, -Math.min(...moving.map((c) => c.start)))
  const index = (id: string) => seq.tracks.findIndex((t) => t.id === id)
  const fits = moving.every((c) => {
    const from = seq.tracks[index(c.trackId)]
    const to = seq.tracks[index(c.trackId) + trackShift]
    return to && to.kind === from.kind && !to.locked
  })
  const shift = fits ? trackShift : 0
  const movedIds = new Set(moving.map((c) => c.id))
  const clips = seq.clips.map((c) =>
    movedIds.has(c.id)
      ? { ...c, start: c.start + safeDelta, trackId: seq.tracks[index(c.trackId) + shift].id }
      : c
  )
  return placeClips({ ...seq, clips }, [...movedIds], magnetic)
}

/** Borrar. Con onda, lo posterior de cada pista afectada se desplaza a la izquierda. */
export function deleteClips(seq: Sequence, ids: string[], ripple: boolean): Sequence {
  const removed = seq.clips.filter((c) => ids.includes(c.id) && !isLocked(seq, c.trackId))
  const removedIds = new Set(removed.map((c) => c.id))
  let clips = seq.clips.filter((c) => !removedIds.has(c.id))
  if (ripple) {
    for (const r of [...removed].sort((a, b) => b.start - a.start)) {
      const end = clipEnd(r)
      const d = clipDuration(r)
      clips = clips.map((c) => (c.trackId === r.trackId && c.start >= end ? { ...c, start: c.start - d } : c))
    }
  }
  return { ...seq, clips }
}

/** Cerrar huecos. */
export function closeGaps(seq: Sequence, trackId: string): Sequence {
  if (isLocked(seq, trackId)) return seq
  const compacted = compact(clipsOn(seq.clips, trackId))
  return { ...seq, clips: [...seq.clips.filter((c) => c.trackId !== trackId), ...compacted] }
}

export function createClip(media: MediaItem, trackId: string, start: Micros): Clip {
  const length = media.duration ?? STILL_DURATION
  return {
    id: newId('clip'),
    mediaId: media.id,
    trackId,
    start,
    sourceIn: 0,
    sourceOut: length,
    speed: 1,
    reversed: false,
    volume: 100,
    transform: { ...DEFAULT_TRANSFORM },
    text: media.kind === 'text' ? media.name : undefined
  }
}

/** Añadir medio. Sin pista compatible, crea una. */
export function insertMedia(
  seq: Sequence,
  media: MediaItem,
  trackId: string | null,
  start: Micros,
  magnetic: boolean
): { seq: Sequence; clipId: string | null } {
  let target = seq
  let tid = trackId
  const kind = trackKindFor(media.kind)
  if (!tid || trackOf(seq, tid)?.kind !== kind) {
    const added = addTrack(seq, kind)
    target = added.seq
    tid = added.trackId
  }
  if (isLocked(target, tid)) return { seq, clipId: null }
  const clip = createClip(media, tid, Math.max(0, start))
  return { seq: placeClips({ ...target, clips: [...target.clips, clip] }, [clip.id], magnetic), clipId: clip.id }
}

export function trackEnd(seq: Sequence, trackId: string): Micros {
  return clipsOn(seq.clips, trackId).reduce((max, c) => Math.max(max, clipEnd(c)), 0)
}

/** Las pistas visuales nuevas van encima de las demás; las de audio, al final. */
export function addTrack(seq: Sequence, kind: TrackKind): { seq: Sequence; trackId: string } {
  const count = seq.tracks.filter((t) => t.kind === kind).length + 1
  const track: Track = {
    id: newId('track'),
    kind,
    name: kind === 'visual' ? `Vídeo ${count}` : `Audio ${count}`,
    locked: false,
    hidden: false,
    muted: false
  }
  const tracks = kind === 'visual' ? [track, ...seq.tracks] : [...seq.tracks, track]
  return { seq: { ...seq, tracks }, trackId: track.id }
}

/** Duplicar: la copia queda justo detrás del original, en su pista. */
export function duplicateClips(seq: Sequence, ids: string[], magnetic: boolean): { seq: Sequence; created: string[] } {
  const sources = seq.clips.filter((c) => ids.includes(c.id) && !isLocked(seq, c.trackId))
  if (!sources.length) return { seq, created: [] }
  const blockEnd = Math.max(...sources.map(clipEnd))
  const blockStart = Math.min(...sources.map((c) => c.start))
  const copies = sources.map((c) => ({ ...c, id: newId('clip'), groupId: undefined, start: c.start + (blockEnd - blockStart) }))
  const created = copies.map((c) => c.id)
  return { seq: placeClips({ ...seq, clips: [...seq.clips, ...copies] }, created, magnetic), created }
}

/** Pegar: en el cabezal, en las pistas de origen que sigan existiendo y no estén bloqueadas. */
export function pasteClips(seq: Sequence, clipboard: Clip[], at: Micros, magnetic: boolean): { seq: Sequence; created: string[] } {
  const usable = clipboard.filter((c) => trackOf(seq, c.trackId) && !isLocked(seq, c.trackId))
  if (!usable.length) return { seq, created: [] }
  const origin = Math.min(...usable.map((c) => c.start))
  const copies = usable.map((c) => ({ ...c, id: newId('clip'), groupId: undefined, start: c.start - origin + at }))
  const created = copies.map((c) => c.id)
  return { seq: placeClips({ ...seq, clips: [...seq.clips, ...copies] }, created, magnetic), created }
}

export function groupClips(seq: Sequence, ids: string[]): Sequence {
  if (ids.length < 2) return seq
  const groupId = newId('group')
  return { ...seq, clips: seq.clips.map((c) => (ids.includes(c.id) ? { ...c, groupId } : c)) }
}

export function ungroupClips(seq: Sequence, ids: string[]): Sequence {
  return { ...seq, clips: seq.clips.map((c) => (ids.includes(c.id) ? { ...c, groupId: undefined } : c)) }
}

/** Amplía una selección a los grupos completos. */
export function expandGroups(seq: Sequence, ids: string[]): string[] {
  const groups = new Set(seq.clips.filter((c) => ids.includes(c.id) && c.groupId).map((c) => c.groupId))
  return seq.clips.filter((c) => ids.includes(c.id) || (c.groupId && groups.has(c.groupId))).map((c) => c.id)
}

/** La transición solo existe si el clip siguiente de la pista es contiguo. */
export function nextContiguous(seq: Sequence, c: Clip): Clip | undefined {
  const end = clipEnd(c)
  return seq.clips.find((x) => x.trackId === c.trackId && x.id !== c.id && x.start === end)
}

export function setTransition(seq: Sequence, clipId: string, name: string | null): Sequence {
  return {
    ...seq,
    clips: seq.clips.map((c) =>
      c.id === clipId ? { ...c, transitionOut: name ? { name, duration: DEFAULT_TRANSITION } : undefined } : c
    )
  }
}

/**
 * Cambiar la velocidad cambia la duración. Lo posterior de la pista se desplaza la diferencia,
 * para no tapar ni dejar huecos que el usuario no ha pedido.
 */
export function setSpeed(seq: Sequence, clipId: string, speed: number): Sequence {
  const c = seq.clips.find((x) => x.id === clipId)
  if (!c || isLocked(seq, c.trackId)) return seq
  const clamped = Math.min(10, Math.max(0.1, speed))
  const updated = { ...c, speed: clamped }
  const diff = clipDuration(updated) - clipDuration(c)
  const oldEnd = clipEnd(c)
  return {
    ...seq,
    clips: seq.clips.map((x) => {
      if (x.id === clipId) return updated
      if (x.trackId === c.trackId && x.start >= oldEnd) return { ...x, start: x.start + diff }
      return x
    })
  }
}

export function updateClip(seq: Sequence, clipId: string, patch: Partial<Omit<Clip, 'id' | 'start' | 'trackId'>>): Sequence {
  return { ...seq, clips: seq.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
}

export function updateTrack(seq: Sequence, trackId: string, patch: Partial<Omit<Track, 'id' | 'kind'>>): Sequence {
  return { ...seq, tracks: seq.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)) }
}

/** Puntos a los que se imanta un borde. */
export function snapPoints(seq: Sequence, excludeIds: string[], playhead: Micros): Micros[] {
  const points = new Set<Micros>([0, playhead])
  for (const c of seq.clips) {
    if (excludeIds.includes(c.id)) continue
    points.add(c.start)
    points.add(clipEnd(c))
  }
  return [...points]
}

export function nearestSnap(t: Micros, points: Micros[], threshold: Micros): Micros | null {
  let best: Micros | null = null
  for (const p of points) {
    if (Math.abs(p - t) <= threshold && (best === null || Math.abs(p - t) < Math.abs(best - t))) best = p
  }
  return best
}
