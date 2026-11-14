import { AlertTriangle, Camera, ChevronFirst, ChevronLast, Loader2, Maximize, Pause, Play, StepBack, StepForward, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { bridge, findMedia, useEditor, usedAndOwnMedia, useVisibleSequence } from '@/features/editor/store/editor-store'
import { clipEnd, sequenceDuration } from '@/features/timeline/model/operations'
import { formatTimecode, frameDuration } from '@/features/timeline/model/time'
import { SECOND, type Clip, type EffectId, type MediaItem, type Sequence } from '@/features/timeline/model/types'
import { MediaThumb } from '@/shared/components/media-thumb'
import { mediaUrl } from '../../../../../shared/contracts'
import { previewOutput } from '../audio-output'
import { usePlayableClip } from '../use-playable-clip'
import { registerPlaybackClock } from '../playback-clock'
import { transitionEnvelope, transitionTiming } from '../../../../../shared/transition-envelope'

const PRELOAD = 1.5 * SECOND
const DRIFT = 0.04

/** Gemelo en CSS de los filtros de exportacion (export-graph.ts). */
export const EFFECT_CSS: Record<EffectId, string> = {
  bw: 'grayscale(1)',
  warm: 'sepia(0.25) saturate(1.15) hue-rotate(-8deg)',
  cool: 'saturate(1.05) hue-rotate(12deg) brightness(1.02)',
  contrast: 'contrast(1.25) brightness(1.03)',
  vignette: '',
  blur: 'blur(6px)'
}

interface Layer {
  clip: Clip
  active: boolean
}

/** Capas visuales de abajo arriba, con las que empiezan en breve precargadas. */
function visualLayers(seq: Sequence, t: number): Layer[] {
  const tracks = seq.tracks.filter((tr) => tr.kind === 'visual' && !tr.hidden).reverse()
  return tracks.flatMap((tr) =>
    seq.clips
      .filter((c) => c.trackId === tr.id && transitionTiming(seq, c).start - PRELOAD <= t && t < transitionTiming(seq, c).end)
      .sort((a, b) => a.start - b.start)
      .map((clip) => ({ clip, active: transitionTiming(seq, clip).start <= t }))
  )
}

function audioVoices(seq: Sequence, t: number): Layer[] {
  const tracks = new Map(seq.tracks.map((tr) => [tr.id, tr]))
  return seq.clips
    .filter((c) => tracks.get(c.trackId)?.kind === 'audio' && c.start - PRELOAD <= t && t < clipEnd(c))
    .map((clip) => ({ clip, active: clip.start <= t }))
}

/** Mantiene un elemento de video/audio alineado con el cabezal. */
function useSync(ref: React.RefObject<HTMLMediaElement | null>, clip: Clip, active: boolean, muted: boolean) {
  const playhead = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)
  const masterMuted = useEditor((s) => s.previewMuted)

  useEffect(() => {
    const element = ref.current
    if (element) return registerPlaybackClock(element, clip)
  }, [ref, clip])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const output = previewOutput(el)
    output.gain.connect(output.context.destination)
    return () => { output.gain.disconnect(); el.pause() }
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const within = Math.max(0, playhead - clip.start)
    const target = Math.min(clip.sourceOut / SECOND - 0.001, (clip.sourceIn + within * clip.speed) / SECOND)
    const withinSource = playhead >= clip.start && playhead < clipEnd(clip)
    el.muted = muted || masterMuted || !active || !withinSource || clip.volume === 0
    // Fundidos: la ganancia sube al entrar y baja al salir, como en la exportacion (afade).
    const dur = clipEnd(clip) - clip.start
    const ramp = Math.min(clip.fadeIn ? within / clip.fadeIn : 1, clip.fadeOut ? (dur - within) / clip.fadeOut : 1, 1)
    el.volume = 1
    const output = previewOutput(el)
    output.gain.gain.setValueAtTime(Math.max(0, (clip.volume / 100) * ramp), output.context.currentTime)
    if (playing && active && output.context.state === 'suspended') void output.context.resume().catch(() => undefined)
    if (Math.abs(el.playbackRate - clip.speed) > 1e-3) el.playbackRate = clip.speed
    if (playing && active && withinSource) {
      if (!el.seeking && Math.abs(el.currentTime - target) > DRIFT * clip.speed) el.currentTime = target
      if (el.paused) void el.play().catch(() => undefined)
    } else {
      if (!el.paused) el.pause()
      if (Math.abs(el.currentTime - target) > 0.02) el.currentTime = target
    }
  }, [ref, clip, active, muted, masterMuted, playhead, playing])
}

function VideoLayer({ clip, media, active }: { clip: Clip; media: MediaItem; active: boolean }) {
  const playable = usePlayableClip(clip, media)
  if (!playable.path) return <div className="absolute inset-0 flex items-center justify-center text-2xs text-muted">{playable.error ?? 'Preparando reproducción inversa…'}</div>
  return <VideoElement key={playable.path} clip={playable.clip} path={playable.path} active={active} />
}

function VideoElement({ clip, path, active }: { clip: Clip; path: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useSync(ref, clip, active, false)
  return <video ref={ref} crossOrigin="anonymous" src={mediaUrl(path)} preload="auto" playsInline className="h-full w-full object-contain" />
}

function AudioVoice({ clip, media, muted }: { clip: Clip; media: MediaItem; muted: boolean }) {
  const playable = usePlayableClip(clip, media)
  if (!playable.path) return <span className="sr-only">{playable.error ?? 'Preparando audio inverso…'}</span>
  return <AudioElement key={playable.path} clip={playable.clip} path={playable.path} muted={muted} />
}

function AudioElement({ clip, path, muted }: { clip: Clip; path: string; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)
  const active = useEditor((s) => s.playhead >= clip.start)
  useSync(ref, clip, active, muted)
  return <audio ref={ref} crossOrigin="anonymous" src={mediaUrl(path)} preload="auto" />
}

export function PreviewPanel() {
  const seq = useVisibleSequence()
  const media = useEditor((s) => s.media)
  const playhead = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)
  const previewMuted = useEditor((s) => s.previewMuted)
  const { setPlaying, setPlayhead, showToast } = useEditor.getState()
  const total = sequenceDuration(seq)
  const layers = visualLayers(seq, playhead)
  const voices = audioVoices(seq, playhead)
  const frame = frameDuration(seq.fps)
  const stage = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const captureFrame = async () => {
    const b = bridge()
    if (!b) return showToast('La captura de fotograma funciona en la app de escritorio')
    const { sequence, media: all, projectName } = useEditor.getState()
    setCapturing(true)
    const r = await b.captureFrame({ sequence, media: usedAndOwnMedia(all, sequence), at: playhead, name: projectName })
    setCapturing(false)
    showToast(r.ok ? 'Fotograma guardado en Imágenes\\WonderFilm y añadido a la biblioteca' : r.message)
  }

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const tracks = new Map(seq.tracks.map((t) => [t.id, t]))

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-base">
      <div ref={stage} className="flex min-h-0 flex-1 items-center justify-center bg-base p-4">
        <div
          className="relative max-h-full max-w-full overflow-hidden bg-black shadow-[0_0_0_1px_rgb(var(--c-line))]"
          style={{ aspectRatio: `${seq.width} / ${seq.height}`, height: '100%' }}
          onDoubleClick={() => (full ? document.exitFullscreen() : stage.current?.requestFullscreen())}
        >
          {!layers.some((l) => l.active) && (
            <div className="absolute inset-0 flex items-center justify-center text-2xs text-muted">
              {seq.clips.length === 0 ? 'Añade clips a la línea de tiempo para verlos aquí' : ''}
            </div>
          )}
          {layers.map(({ clip, active }) => (
            <LayerView key={clip.id} clip={clip} media={findMedia(media, clip.mediaId)} active={active} />
          ))}
        </div>
      </div>
      {voices.map(({ clip }) => {
        const m = findMedia(media, clip.mediaId)
        if (!m?.source || m.status === 'missing') return null
        return <AudioVoice key={clip.id} clip={clip} media={m} muted={tracks.get(clip.trackId)?.muted ?? false} />
      })}

      <div className="flex h-11 shrink-0 items-center gap-3 border-t border-line bg-panel px-3">
        <span className="font-mono text-[12px] text-accent">{formatTimecode(playhead, seq.fps)}</span>
        <span className="font-mono text-[12px] text-muted">/ {formatTimecode(total, seq.fps)}</span>
        <div className="mx-auto flex items-center gap-0.5">
          <button className="btn-icon" onClick={() => setPlayhead(0)} aria-label="Ir al inicio" title="Ir al inicio (Inicio)">
            <ChevronFirst className="h-4 w-4" />
          </button>
          <button className="btn-icon" onClick={() => setPlayhead(playhead - frame)} aria-label="Fotograma anterior" title="Fotograma anterior (←)">
            <StepBack className="h-4 w-4" />
          </button>
          <button
            className="mx-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink text-base hover:bg-accent disabled:opacity-40"
            onClick={() => setPlaying(!playing)}
            disabled={total === 0}
            aria-label={playing ? 'Pausar' : 'Reproducir'}
            title={playing ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <button className="btn-icon" onClick={() => setPlayhead(playhead + frame)} aria-label="Fotograma siguiente" title="Fotograma siguiente (→)">
            <StepForward className="h-4 w-4" />
          </button>
          <button className="btn-icon" onClick={() => setPlayhead(total)} aria-label="Ir al final" title="Ir al final (Fin)">
            <ChevronLast className="h-4 w-4" />
          </button>
        </div>
        <button
          className="btn-icon"
          aria-pressed={previewMuted}
          onClick={() => useEditor.setState({ previewMuted: !previewMuted })}
          aria-label={previewMuted ? 'Activar sonido' : 'Silenciar vista previa'}
          title={previewMuted ? 'Activar sonido' : 'Silenciar vista previa'}
        >
          {previewMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button
          className="btn-icon"
          onClick={() => void captureFrame()}
          disabled={capturing || total === 0}
          aria-label="Capturar fotograma"
          title="Capturar fotograma (se guarda en Imágenes y se añade a la biblioteca)"
        >
          <Camera className="h-4 w-4" />
        </button>
        <button
          className="btn-icon"
          onClick={() => (full ? document.exitFullscreen() : stage.current?.requestFullscreen())}
          aria-label="Pantalla completa"
          title="Pantalla completa (doble clic en el visor)"
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>
    </section>
  )
}

function LayerView({ clip, media, active }: { clip: Clip; media: MediaItem | undefined; active: boolean }) {
  const sequence = useVisibleSequence()
  const playhead = useEditor(s => s.playhead)
  const { opacity, scale, x, y, rotation } = clip.transform
  const transition = transitionTiming(sequence, clip)
  const progress = transition.incoming ? Math.max(0, Math.min(1, (playhead - transition.start) / (transition.incoming * 2))) : 1
  const zoom = transition.name === 'Zoom suave' ? 0.8 + 0.2 * progress : 1
  const slide = transition.name === 'Deslizar arriba' ? 100 * (1 - progress) : 0
  const filters = (clip.effects ?? []).map((e) => EFFECT_CSS[e]).filter(Boolean).join(' ')
  const style: CSSProperties = {
    opacity: active ? opacity / 100 * transitionEnvelope(sequence, clip, playhead) : 0,
    transform: `translate(${x}%, ${y + slide}%) scale(${scale / 100 * zoom}) rotate(${rotation}deg)`,
    filter: [filters, transition.name === 'Desenfoque' && progress < 1 ? `blur(${8 * (1 - progress)}px)` : ''].filter(Boolean).join(' ') || undefined,
    clipPath: transition.name === 'Barrido lateral' && progress < 1 ? `inset(0 ${100 * (1 - progress)}% 0 0)` : undefined
  }
  const vignette = clip.effects?.includes('vignette') && (
    <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgb(0 0 0 / 0.75) 100%)' }} />
  )

  if (media?.kind === 'text') {
    if (!active) return null
    return (
      <div className="absolute inset-0 flex items-end justify-center p-[6%]" style={style}>
        <span className="whitespace-pre-wrap rounded bg-black/35 px-[0.6em] py-[0.2em] text-center text-[clamp(14px,3.2vw,44px)] font-bold leading-tight text-white drop-shadow-lg" style={{ color: clip.textColor }}>
          {clip.text || media.name}
        </span>
      </div>
    )
  }

  if (!media || media.status === 'missing') {
    if (!active) return null
    return (
      <div className="stripes-danger absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <AlertTriangle className="h-8 w-8 text-danger" />
        <p className="text-sm font-medium">Medio no encontrado</p>
        <p className="text-2xs text-muted">{media?.name ?? 'Archivo desconocido'}</p>
      </div>
    )
  }

  if (media.source && media.kind === 'video') {
    return (
      <div className="absolute inset-0" style={style}>
        <VideoLayer clip={clip} media={media} active={active} />
        {vignette}
      </div>
    )
  }

  if (media.source && media.kind === 'image') {
    return (
      <div className="absolute inset-0" style={style}>
        <img src={mediaUrl(media.source.path)} alt="" draggable={false} className="h-full w-full object-contain" />
        {vignette}
      </div>
    )
  }

  if (!active) return null
  return (
    <div className="absolute inset-0" style={style}>
      <MediaThumb media={media} className="h-full w-full" />
      {vignette}
      {media.status === 'importing' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-2xs">
          <Loader2 className="h-4 w-4 animate-spin" /> Generando vista previa…
        </div>
      )}
    </div>
  )
}
