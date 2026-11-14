/** Microsegundos enteros. */
export type Micros = number

export const SECOND: Micros = 1_000_000

export interface Rational {
  num: number
  den: number
}

export type MediaKind = 'video' | 'image' | 'audio' | 'text'

export type MediaStatus = 'ready' | 'importing' | 'missing'

/** El fichero real detras de un medio. Las rutas son absolutas; nunca URLs (se derivan). */
export interface MediaSource {
  path: string
  /** Lo que se reproduce: el original, o su proxy si Chromium no sabe decodificarlo. */
  playPath: string
  proxy?: boolean
  hasAudio: boolean
  fps?: number
  codec?: string
  thumbPath?: string
  /** Tira de miniaturas en horizontal: `frames` fotogramas, uno cada `interval` segundos. */
  strip?: { path: string; frames: number; interval: number }
  /** JSON con 50 picos por segundo, de 0 a 100. */
  peaksPath?: string
}

export interface MediaItem {
  id: string
  name: string
  kind: MediaKind
  /** null para imagen y texto: no tienen duración de fuente. */
  duration: Micros | null
  width?: number
  height?: number
  /** Tono de la miniatura de muestra (Fase 1, sin decodificar medios reales). */
  hue: number
  status: MediaStatus
  progress?: number
  sizeLabel?: string
  /** Ausente en los medios de muestra: esos no tienen fichero. */
  source?: MediaSource
}

export const EFFECTS = ['bw', 'warm', 'cool', 'contrast', 'vignette', 'blur'] as const
export type EffectId = (typeof EFFECTS)[number]

export type TrackKind = 'visual' | 'audio'

export interface Track {
  id: string
  kind: TrackKind
  name: string
  locked: boolean
  hidden: boolean
  muted: boolean
}

export const COLOR_TAGS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'pink'] as const
export type ColorTag = (typeof COLOR_TAGS)[number]

export interface ClipTransform {
  opacity: number
  scale: number
  x: number
  y: number
  rotation: number
}

export interface Clip {
  id: string
  mediaId: string
  trackId: string
  /** Posición en la secuencia. */
  start: Micros
  /** Tramo usado de la fuente. */
  sourceIn: Micros
  sourceOut: Micros
  speed: number
  reversed: boolean
  volume: number
  transform: ClipTransform
  colorTag?: ColorTag
  groupId?: string
  /** Transición hacia el clip siguiente contiguo. */
  transitionOut?: { name: string; duration: Micros }
  text?: string
  /** Color del titulo, en hexadecimal (#rrggbb). */
  textColor?: string
  effects?: EffectId[]
  /** Fundidos de audio, en tiempo de la secuencia. */
  fadeIn?: Micros
  fadeOut?: Micros
}

export interface Sequence {
  id: string
  name: string
  width: number
  height: number
  fps: Rational
  sampleRate: number
  channels: number
  /** De arriba abajo: primero las visuales (la de arriba tapa a las de abajo), luego audio. */
  tracks: Track[]
  clips: Clip[]
}

export const DEFAULT_TRANSFORM: ClipTransform = { opacity: 100, scale: 100, x: 0, y: 0, rotation: 0 }
