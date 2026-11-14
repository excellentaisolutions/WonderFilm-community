import { describe, expect, it } from 'vitest'
import {
  addTrack,
  clipDuration,
  clipEnd,
  closeGaps,
  createClip,
  deleteClips,
  duplicateClips,
  expandGroups,
  groupClips,
  insertMedia,
  mainTrackId,
  moveClips,
  nearestSnap,
  setSpeed,
  splitAt,
  trimClip,
  updateTrack
} from './operations'
import { formatTimecode, snapToFrame } from './time'
import { SECOND, type Clip, type MediaItem, type Sequence } from './types'

const S = SECOND
const video = (id: string, seconds: number): MediaItem => ({ id, name: id, kind: 'video', duration: seconds * S, hue: 0, status: 'ready' })
const image: MediaItem = { id: 'img', name: 'img', kind: 'image', duration: null, hue: 0, status: 'ready' }

function clip(id: string, trackId: string, start: number, length: number, sourceIn = 0): Clip {
  return { ...createClip(video('m', 60), trackId, start * S), id, sourceIn: sourceIn * S, sourceOut: (sourceIn + length) * S }
}

function seq(clips: Clip[]): Sequence {
  return {
    id: 's',
    name: 's',
    width: 1920,
    height: 1080,
    fps: { num: 25, den: 1 },
    sampleRate: 48000,
    channels: 2,
    tracks: [
      { id: 'v2', kind: 'visual', name: 'V2', locked: false, hidden: false, muted: false },
      { id: 'v1', kind: 'visual', name: 'V1', locked: false, hidden: false, muted: false },
      { id: 'a1', kind: 'audio', name: 'A1', locked: false, hidden: false, muted: false }
    ],
    clips
  }
}

const get = (s: Sequence, id: string) => s.clips.find((c) => c.id === id)!
const spans = (s: Sequence, track: string) =>
  s.clips
    .filter((c) => c.trackId === track)
    .sort((a, b) => a.start - b.start)
    .map((c) => [c.start / S, clipEnd(c) / S])

/** ninguna operación deja dos clips solapados en una pista. */
function expectNoOverlaps(s: Sequence) {
  for (const t of s.tracks) {
    const list = s.clips.filter((c) => c.trackId === t.id).sort((a, b) => a.start - b.start)
    for (let i = 1; i < list.length; i++) expect(list[i].start).toBeGreaterThanOrEqual(clipEnd(list[i - 1]))
  }
}

describe('tiempo', () => {
  it('ajusta al fotograma y escribe el código de tiempo con la cadencia de la secuencia', () => {
    expect(snapToFrame(1_030_000, { num: 25, den: 1 })).toBe(1_040_000)
    expect(formatTimecode(61 * S + 480_000, { num: 25, den: 1 })).toBe('00:01:01:12')
    expect(formatTimecode(S / 2, { num: 30000, den: 1001 })).toBe('00:00:00:15')
  })
})

describe('dividir', () => {
  it('sin selección corta todos los clips bajo el cabezal, salvo en pistas bloqueadas', () => {
    let s = seq([clip('a', 'v1', 0, 10), clip('b', 'v2', 2, 6), clip('c', 'a1', 0, 10)])
    s = updateTrack(s, 'a1', { locked: true })
    const { seq: out, created } = splitAt(s, 4 * S)
    expect(created).toHaveLength(2)
    expect(spans(out, 'v1')).toEqual([[0, 4], [4, 10]])
    expect(spans(out, 'a1')).toEqual([[0, 10]])
  })

  it('con selección corta solo lo seleccionado y la segunda mitad continúa la fuente', () => {
    const s = seq([clip('a', 'v1', 0, 10, 3), clip('b', 'v2', 0, 10)])
    const { seq: out, created } = splitAt(s, 4 * S, ['a'])
    expect(spans(out, 'v2')).toEqual([[0, 10]])
    const right = get(out, created[0])
    expect(right.sourceIn).toBe(7 * S)
    expect(right.sourceOut).toBe(13 * S)
  })
})

describe('dividir conserva los fundidos de los extremos', () => {
  it('la mitad izquierda pierde el de salida y la derecha el de entrada', () => {
    const s = seq([{ ...clip('a', 'v1', 0, 10), fadeIn: S, fadeOut: 2 * S }])
    const { seq: out, created } = splitAt(s, 4 * S)
    const left = get(out, 'a')
    const right = get(out, created[0])
    expect([left.fadeIn, left.fadeOut]).toEqual([S, undefined])
    expect([right.fadeIn, right.fadeOut]).toEqual([undefined, 2 * S])
  })
})

describe('recortar', () => {
  it('no alarga un vídeo más allá de su fuente ni lo mete en el vecino', () => {
    const s = seq([clip('a', 'v1', 0, 10), clip('b', 'v1', 12, 5)])
    const media = video('m', 60)
    expect(clipEnd(get(trimClip(s, 'a', 'end', 20 * S, media), 'a'))).toBe(12 * S)
    const short = video('m', 11)
    expect(clipEnd(get(trimClip(s, 'a', 'end', 20 * S, short), 'a'))).toBe(11 * S)
  })

  it('una imagen se puede alargar libremente', () => {
    const s = seq([{ ...createClip(image, 'v1', 0), id: 'i' }])
    expect(clipDuration(get(trimClip(s, 'i', 'end', 30 * S, image), 'i'))).toBe(30 * S)
  })

  it('recortar el inicio avanza la entrada de la fuente', () => {
    const s = seq([clip('a', 'v1', 0, 10)])
    const out = get(trimClip(s, 'a', 'start', 3 * S, video('m', 60)), 'a')
    expect([out.start, out.sourceIn]).toEqual([3 * S, 3 * S])
  })
})

describe('mover y sobrescribir', () => {
  it('el clip movido recorta y divide lo que tapa', () => {
    const s = seq([clip('long', 'v2', 0, 20), clip('m', 'v2', 30, 4)])
    const out = moveClips(s, ['m'], -22 * S, 0, false)
    expect(spans(out, 'v2')).toEqual([[0, 8], [8, 12], [12, 20]])
    expectNoOverlaps(out)
  })

  it('no cambia a una pista de otra clase ni a una bloqueada', () => {
    const s = updateTrack(seq([clip('a', 'v1', 0, 5)]), 'v2', { locked: true })
    expect(get(moveClips(s, ['a'], 0, 1, false), 'a').trackId).toBe('v1')
    expect(get(moveClips(s, ['a'], 0, -1, false), 'a').trackId).toBe('v1')
  })

  it('nunca lleva un clip a tiempo negativo', () => {
    const s = seq([clip('a', 'v2', 2, 5)])
    expect(get(moveClips(s, ['a'], -10 * S, 0, false), 'a').start).toBe(0)
  })
})

describe('modo magnético', () => {
  it('en la pista principal, mover inserta y reordena sin huecos', () => {
    const s = seq([clip('a', 'v1', 0, 4), clip('b', 'v1', 4, 4), clip('c', 'v1', 8, 4)])
    // Soltar en 3 s: pasada la mitad de «a» (2 s) y antes de la de «b» (6 s).
    const out = moveClips(s, ['c'], -5 * S, 0, true)
    expect(moveClips(s, ['c'], -7 * S, 0, true).clips.find((c) => c.start === 0)!.id).toBe('c')
    expect(out.clips.filter((c) => c.trackId === 'v1').sort((x, y) => x.start - y.start).map((c) => c.id)).toEqual(['a', 'c', 'b'])
    expect(spans(out, 'v1')).toEqual([[0, 4], [4, 8], [8, 12]])
  })

  it('las demás pistas no se compactan', () => {
    const s = seq([clip('a', 'v1', 0, 4), clip('x', 'v2', 10, 2)])
    expect(spans(moveClips(s, ['x'], 5 * S, 0, true), 'v2')).toEqual([[15, 17]])
  })

  it('insertar medio en la principal empuja lo posterior', () => {
    const s = seq([clip('a', 'v1', 0, 4), clip('b', 'v1', 4, 4)])
    const { seq: out } = insertMedia(s, video('n', 3), 'v1', 1 * S, true)
    expect(spans(out, 'v1')).toEqual([[0, 3], [3, 7], [7, 11]])
    expect(mainTrackId(out)).toBe('v1')
  })
})

describe('borrar', () => {
  it('borrar normal deja hueco; con onda, lo posterior de esa pista se desplaza', () => {
    const s = seq([clip('a', 'v2', 0, 4), clip('b', 'v2', 4, 4), clip('c', 'v2', 8, 4), clip('x', 'a1', 8, 4)])
    expect(spans(deleteClips(s, ['b'], false), 'v2')).toEqual([[0, 4], [8, 12]])
    const rippled = deleteClips(s, ['b'], true)
    expect(spans(rippled, 'v2')).toEqual([[0, 4], [4, 8]])
    expect(spans(rippled, 'a1')).toEqual([[8, 12]])
  })

  it('cerrar huecos compacta la pista', () => {
    const s = seq([clip('a', 'v2', 2, 4), clip('b', 'v2', 10, 4)])
    expect(spans(closeGaps(s, 'v2'), 'v2')).toEqual([[0, 4], [4, 8]])
  })

  it('una pista bloqueada no se edita', () => {
    const s = updateTrack(seq([clip('a', 'v2', 0, 4)]), 'v2', { locked: true })
    expect(deleteClips(s, ['a'], true).clips).toHaveLength(1)
    expect(insertMedia(s, video('n', 3), 'v2', 0, false).clipId).toBeNull()
  })
})

describe('resto de operaciones', () => {
  it('la velocidad cambia la duración y desplaza lo posterior', () => {
    const s = seq([clip('a', 'v2', 0, 10), clip('b', 'v2', 10, 2)])
    const out = setSpeed(s, 'a', 2)
    expect(spans(out, 'v2')).toEqual([[0, 5], [5, 7]])
    expect(get(setSpeed(s, 'a', 50), 'a').speed).toBe(10)
  })

  it('duplicar coloca la copia detrás sin solapes', () => {
    const s = seq([clip('a', 'v2', 0, 4), clip('b', 'v2', 5, 4)])
    const { seq: out } = duplicateClips(s, ['a'], false)
    expectNoOverlaps(out)
    expect(spans(out, 'v2')).toEqual([[0, 4], [4, 8], [8, 9]])
  })

  it('los grupos se seleccionan enteros', () => {
    const s = groupClips(seq([clip('a', 'v2', 0, 4), clip('b', 'a1', 0, 4), clip('c', 'v1', 0, 4)]), ['a', 'b'])
    expect(expandGroups(s, ['a']).sort()).toEqual(['a', 'b'])
  })

  it('las pistas visuales nuevas van arriba y las de audio abajo', () => {
    const v = addTrack(seq([]), 'visual')
    expect(v.seq.tracks[0].id).toBe(v.trackId)
    const a = addTrack(seq([]), 'audio')
    expect(a.seq.tracks.at(-1)!.id).toBe(a.trackId)
  })

  it('el imantado elige el punto más cercano dentro del umbral', () => {
    expect(nearestSnap(100, [0, 95, 130], 10)).toBe(95)
    expect(nearestSnap(100, [0, 130], 10)).toBeNull()
  })
})
