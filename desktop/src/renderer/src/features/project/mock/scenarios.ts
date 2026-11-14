import { createClip } from '@/features/timeline/model/operations'
import { SECOND, type Clip, type MediaItem, type Sequence, type Track } from '@/features/timeline/model/types'

export type Scenario = 'normal' | 'empty' | 'loading' | 'error'

export const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'empty', label: 'Vacío' },
  { id: 'loading', label: 'Cargando' },
  { id: 'error', label: 'Error' }
]

const S = SECOND

const baseMedia: MediaItem[] = [
  { id: 'm-amanecer', name: 'Amanecer en la costa.mp4', kind: 'video', duration: 14 * S, width: 1920, height: 1080, hue: 28, status: 'ready', sizeLabel: '84 MB' },
  { id: 'm-ciudad', name: 'Paseo por la ciudad.mp4', kind: 'video', duration: 22 * S, width: 1920, height: 1080, hue: 212, status: 'ready', sizeLabel: '131 MB' },
  { id: 'm-taller', name: 'Taller — plano detalle.mov', kind: 'video', duration: 9 * S, width: 3840, height: 2160, hue: 160, status: 'ready', sizeLabel: '402 MB' },
  { id: 'm-entrevista', name: 'Entrevista Marta.mp4', kind: 'video', duration: 48 * S, width: 1920, height: 1080, hue: 340, status: 'ready', sizeLabel: '296 MB' },
  { id: 'm-logo', name: 'logo-estudio.png', kind: 'image', duration: null, width: 1200, height: 1200, hue: 48, status: 'ready', sizeLabel: '220 KB' },
  { id: 'm-mapa', name: 'mapa-ruta.jpg', kind: 'image', duration: null, width: 2400, height: 1350, hue: 120, status: 'ready', sizeLabel: '1,4 MB' },
  { id: 'm-musica', name: 'Pista acústica.wav', kind: 'audio', duration: 96 * S, hue: 150, status: 'ready', sizeLabel: '16 MB' },
  { id: 'm-voz', name: 'Locución v3.m4a', kind: 'audio', duration: 31 * S, hue: 90, status: 'ready', sizeLabel: '2,1 MB' }
]

export const TEXT_PRESETS: MediaItem[] = [
  { id: 't-titulo', name: 'Título grande', kind: 'text', duration: null, hue: 265, status: 'ready' },
  { id: 't-tercio', name: 'Rótulo inferior', kind: 'text', duration: null, hue: 285, status: 'ready' },
  { id: 't-creditos', name: 'Créditos finales', kind: 'text', duration: null, hue: 250, status: 'ready' },
  { id: 't-subtitulo', name: 'Subtítulo', kind: 'text', duration: null, hue: 300, status: 'ready' }
]

export const AUDIO_LIBRARY: MediaItem[] = [
  { id: 'a-brisa', name: 'Brisa de verano', kind: 'audio', duration: 128 * S, hue: 170, status: 'ready', sizeLabel: 'Alegre · 2:08' },
  { id: 'a-pulso', name: 'Pulso urbano', kind: 'audio', duration: 154 * S, hue: 200, status: 'ready', sizeLabel: 'Electrónica · 2:34' },
  { id: 'a-calma', name: 'Calma', kind: 'audio', duration: 181 * S, hue: 120, status: 'ready', sizeLabel: 'Ambiental · 3:01' },
  { id: 'a-click', name: 'Clic suave', kind: 'audio', duration: S / 2, hue: 60, status: 'ready', sizeLabel: 'Efecto · 0:00' },
  { id: 'a-whoosh', name: 'Barrido', kind: 'audio', duration: S, hue: 30, status: 'ready', sizeLabel: 'Efecto · 0:01' }
]

export const TRANSITIONS = ['Fundido cruzado', 'Fundido a negro', 'Barrido lateral', 'Zoom suave', 'Deslizar arriba', 'Desenfoque']

const tracks = (): Track[] => [
  { id: 'track-v3', kind: 'visual', name: 'Vídeo 3', locked: false, hidden: false, muted: false },
  { id: 'track-v2', kind: 'visual', name: 'Vídeo 2', locked: false, hidden: false, muted: false },
  { id: 'track-v1', kind: 'visual', name: 'Vídeo 1', locked: false, hidden: false, muted: false },
  { id: 'track-a1', kind: 'audio', name: 'Audio 1', locked: false, hidden: false, muted: false },
  { id: 'track-a2', kind: 'audio', name: 'Audio 2', locked: false, hidden: false, muted: false }
]

function place(media: MediaItem, trackId: string, start: number, length: number, from = 0, extra: Partial<Clip> = {}): Clip {
  const c = createClip(media, trackId, start * S)
  return { ...c, sourceIn: from * S, sourceOut: (from + length) * S, ...extra }
}

const m = (id: string, list: MediaItem[] = baseMedia) => list.find((x) => x.id === id)!

function normalClips(media: MediaItem[]): Clip[] {
  const at = (id: string) => m(id, media)
  return [
    place(at('m-amanecer'), 'track-v1', 0, 6, 2, { transitionOut: { name: 'Fundido cruzado', duration: S } }),
    place(at('m-ciudad'), 'track-v1', 6, 8, 4),
    place(at('m-entrevista'), 'track-v1', 14, 12, 10, { colorTag: 'orange' }),
    place(at('m-taller'), 'track-v1', 26, 7, 1, { transitionOut: { name: 'Fundido a negro', duration: S } }),
    place(at('m-ciudad'), 'track-v1', 33, 9, 12),
    place(at('m-mapa'), 'track-v2', 17, 4, 0, { transform: { opacity: 100, scale: 38, x: 30, y: -24, rotation: 0 } }),
    place(at('m-logo'), 'track-v2', 37, 5, 0, { transform: { opacity: 90, scale: 30, x: 0, y: 0, rotation: 0 } }),
    { ...place(TEXT_PRESETS[0], 'track-v3', 1, 4), text: 'Hecho a mano' },
    { ...place(TEXT_PRESETS[1], 'track-v3', 15, 5), text: 'Marta Ruiz · Ceramista' },
    place(at('m-musica'), 'track-a1', 0, 42, 0, { volume: 70 }),
    place(at('m-voz'), 'track-a2', 14, 12, 3, { colorTag: 'orange' })
  ]
}

export interface ProjectData {
  name: string
  media: MediaItem[]
  sequence: Sequence
}

function sequence(clips: Clip[]): Sequence {
  return { id: 'seq-main', name: 'Secuencia principal', width: 1920, height: 1080, fps: { num: 30, den: 1 }, sampleRate: 48000, channels: 2, tracks: tracks(), clips }
}

export function buildScenario(scenario: Scenario): ProjectData {
  const name = 'Taller de cerámica'
  if (scenario === 'empty') return { name: 'Proyecto sin título', media: [], sequence: sequence([]) }

  if (scenario === 'loading') {
    const media = baseMedia.map((x, i) =>
      i >= 5 ? { ...x, status: 'importing' as const, progress: [0.18, 0.64, 0.91][i - 5] } : x
    )
    return { name, media, sequence: sequence(normalClips(media)) }
  }

  if (scenario === 'error') {
    const media = baseMedia.map((x) => (x.id === 'm-taller' || x.id === 'm-voz' ? { ...x, status: 'missing' as const } : x))
    return { name, media, sequence: sequence(normalClips(media)) }
  }

  return { name, media: baseMedia, sequence: sequence(normalClips(baseMedia)) }
}

export interface RecentProject {
  id: string
  name: string
  edited: string
  duration: string
  resolution: string
  hue: number
}

export const RECENT_PROJECTS: RecentProject[] = [
  { id: 'r1', name: 'Taller de cerámica', edited: 'Hoy, 11:42', duration: '0:42', resolution: '1080p · 30 fps', hue: 28 },
  { id: 'r2', name: 'Viaje a Asturias', edited: 'Ayer', duration: '6:18', resolution: '4K · 25 fps', hue: 200 },
  { id: 'r3', name: 'Felicitación de cumpleaños', edited: '12 oct', duration: '1:05', resolution: '1080p · 30 fps', hue: 330 },
  { id: 'r4', name: 'Demo producto v2', edited: '3 oct', duration: '2:47', resolution: '1080p · 60 fps', hue: 150 },
  { id: 'r5', name: 'Boda Laura y Pau', edited: '21 sep', duration: '14:32', resolution: '4K · 24 fps', hue: 45 }
]
