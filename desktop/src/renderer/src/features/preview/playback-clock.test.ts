import { expect, it, vi } from 'vitest'
import { playbackTime, registerPlaybackClock } from './playback-clock'
import type { Clip } from '../timeline/model/types'

const clip: Clip = { id: 'c', mediaId: 'm', trackId: 't', start: 2e6, sourceIn: 4e6, sourceOut: 12e6, speed: 2, reversed: false, volume: 100, transform: { x: 0, y: 0, opacity: 100, rotation: 0, scale: 100 } }
const element = (tagName: string, currentTime: number) => ({ tagName, currentTime, readyState: 4, paused: false, seeking: false, pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined) }) as unknown as HTMLMediaElement

it('elige audio como reloj y traduce recorte/velocidad a tiempo de secuencia', () => {
  const removeVideo = registerPlaybackClock(element('VIDEO', 6.2), clip)
  const removeAudio = registerPlaybackClock(element('AUDIO', 6), clip)
  try { expect(playbackTime(3e6)).toBe(3e6) } finally { removeAudio(); removeVideo() }
})

it('no usa una posición vieja mientras se busca ni un medio fuera del clip', () => {
  const media = element('AUDIO', 6)
  const remove = registerPlaybackClock(media, clip)
  try {
    Object.assign(media, { seeking: true }); expect(playbackTime(3e6)).toBeUndefined()
    Object.assign(media, { seeking: false }); expect(playbackTime(0)).toBeUndefined()
    expect(playbackTime(5e6)).toBeUndefined()
  } finally { remove() }
})

it('al desmontar libera el reloj y permite avanzar por huecos', () => {
  const remove = registerPlaybackClock(element('VIDEO', 6), clip)
  remove()
  expect(playbackTime(3e6)).toBeUndefined()
})

it('si el audio está esperando datos, corrige y pausa el vídeo aunque el cabezal no avance', () => {
  const audio = element('AUDIO', 6), video = element('VIDEO', 6.7)
  Object.assign(audio, { readyState: 2 })
  const removeAudio = registerPlaybackClock(audio, clip), removeVideo = registerPlaybackClock(video, clip)
  try {
    expect(playbackTime(3e6)).toBe(3e6)
    expect(video.currentTime).toBe(6)
    expect(video.pause).toHaveBeenCalled()
  } finally { removeAudio(); removeVideo() }
})
