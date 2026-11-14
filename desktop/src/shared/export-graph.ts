import { clipDuration, clipEnd, nextContiguous, sequenceDuration } from '../renderer/src/features/timeline/model/operations'
import type { Clip, EffectId, MediaItem, Sequence } from '../renderer/src/features/timeline/model/types'
import { transitionTiming } from './transition-envelope'

export const EXPORT_FORMATS = ['mp4', 'mp4-hevc', 'mov-prores', 'webm', 'gif', 'mp3', 'png'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]
export const EXPORT_QUALITIES = ['low', 'medium', 'high', 'max'] as const
export type ExportQuality = (typeof EXPORT_QUALITIES)[number]

export const EXTENSION: Record<ExportFormat, string> = {
  mp4: 'mp4',
  'mp4-hevc': 'mp4',
  'mov-prores': 'mov',
  webm: 'webm',
  gif: 'gif',
  mp3: 'mp3',
  png: 'png'
}

export interface ExportJob {
  sequence: Sequence
  media: MediaItem[]
  format: ExportFormat
  quality: ExportQuality
  output: string
  /** Rutas donde el llamador escribira el grafo y los textos (no se tocan aqui: funcion pura). */
  workDir: string
  fontFile: string
  /** Solo con `png`: el instante del fotograma que se captura. */
  frameAt?: number
  /** Codificador por GPU detectado (h264_nvenc, h264_qsv, h264_amf…). Sin el, software. */
  gpu?: { h264?: string; hevc?: string }
}

export interface ExportPlan {
  args: string[]
  graph: string
  textFiles: { path: string; content: string }[]
  durationSeconds: number
  /** Clips que no se pueden exportar porque su medio no tiene fichero o no se encuentra. */
  missing: string[]
}

const CRF: Record<ExportQuality, number> = { low: 30, medium: 26, high: 21, max: 17 }
/** La velocidad del codificador sigue a la calidad: medido, 4 min 1080p tardaban 223 s con `medium` para todo. */
const PRESET: Record<ExportQuality, string> = { low: 'veryfast', medium: 'faster', high: 'medium', max: 'slow' }

/** Filtros de ffmpeg de cada efecto. Su gemelo en CSS vive en la vista previa. */
export const EFFECT_FILTERS: Record<EffectId, string> = {
  bw: 'hue=s=0',
  warm: 'colorbalance=rs=0.10:gs=0.02:bs=-0.10',
  cool: 'colorbalance=rs=-0.10:gs=0.02:bs=0.10',
  contrast: 'eq=contrast=1.25:brightness=0.03',
  vignette: 'vignette=PI/4.5',
  blur: 'gblur=sigma=8'
}

const s = (us: number) => (us / 1_000_000).toFixed(4)

/** Las rutas dentro de un grafo: barras normales, `:` escapados y entre comillas simples. */
export function graphPath(p: string): string {
  return `'${p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''")}'`
}

/** atempo admite 0,5–100 por etapa: por debajo de 0,5 se encadena. */
export function atempoChain(speed: number): string[] {
  const out: string[] = []
  let rest = speed
  while (rest < 0.5) {
    out.push('atempo=0.5')
    rest /= 0.5
  }
  if (Math.abs(rest - 1) > 1e-6) out.push(`atempo=${rest.toFixed(4)}`)
  return out
}

function transitionFades(seq: Sequence, clip: Clip): string[] {
  const out: string[] = []
  const dur = clipDuration(clip)
  if (clip.transitionOut?.name === 'Fundido a negro' && nextContiguous(seq, clip)) {
    const half = Math.min(clip.transitionOut.duration / 2, dur / 2)
    out.push(`fade=t=out:st=${s(dur + transitionTiming(seq, clip).incoming - half)}:d=${s(half)}:alpha=1`)
  }
  const prev = seq.clips.find((c) => c.trackId === clip.trackId && c.id !== clip.id && clipEnd(c) === clip.start && c.transitionOut)
  if (prev?.transitionOut?.name === 'Fundido a negro') {
    const half = Math.min(prev.transitionOut.duration / 2, dur / 2)
    out.push(`fade=t=in:st=0:d=${s(half)}:alpha=1`)
  }
  return out
}

export function buildExport(job: ExportJob): ExportPlan {
  const { sequence: seq, format } = job
  // Una rama del grafo que no se usa deja una salida sin conectar, y ffmpeg rechaza el
  // grafo entero: asi fallaban GIF y MP3 (medido con su prueba, «unconnected output»).
  const wantVideo = format !== 'mp3'
  const wantAudio = format !== 'gif' && format !== 'png'
  const W = seq.width % 2 ? seq.width + 1 : seq.width
  const H = seq.height % 2 ? seq.height + 1 : seq.height
  const fps = `${seq.fps.num}/${seq.fps.den}`
  const total = sequenceDuration(seq)
  const media = new Map(job.media.map((m) => [m.id, m]))
  const trackOf = new Map(seq.tracks.map((t) => [t.id, t]))

  const inputs: string[] = []
  const lines: string[] = []
  const textFiles: ExportPlan['textFiles'] = []
  const missing: string[] = []
  let n = 0
  const inputIndex = new Map<string, number>()

  lines.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${s(total)}[base0]`)
  let current = 'base0'
  let step = 0

  // Capas visuales, de la pista mas baja a la mas alta.
  const visualTracks = wantVideo ? seq.tracks.filter((t) => t.kind === 'visual' && !t.hidden).reverse() : []
  for (const track of visualTracks) {
    const clips = seq.clips.filter((c) => c.trackId === track.id).sort((a, b) => a.start - b.start)
    for (const clip of clips) {
      const m = media.get(clip.mediaId)
      const timing = transitionTiming(seq, clip)
      const start = timing.start
      const end = timing.end
      const enable = `enable='between(t,${s(start)},${s(end)})'`
      const t = clip.transform

      if (!m || (m.kind !== 'text' && (!m.source || m.status === 'missing'))) {
        missing.push(m?.name ?? clip.mediaId)
        continue
      }
      const textFilter: string[] = []
      if (m.kind === 'text') {
        // Los identificadores del documento nunca forman rutas de escritura.
        const file = `${job.workDir}/text-${textFiles.length}.txt`
        textFiles.push({ path: file, content: clip.text || m.name })
        const size = Math.round(H * 0.065)
        const color = /^#[0-9a-f]{6}$/i.test(clip.textColor ?? '') ? `0x${clip.textColor!.slice(1)}` : 'white'
        textFilter.push(`drawtext=fontfile=${graphPath(job.fontFile)}:textfile=${graphPath(file)}:expansion=none:fontsize=${size}:fontcolor=${color}@1.00:box=1:boxcolor=black@0.35:boxborderw=${Math.round(size * 0.3)}:x=(w-text_w)/2:y=h-text_h-${Math.round(H * 0.08)}`)
      }

      const idx = n++
      inputIndex.set(clip.id, idx)
      const transitionDuration = s(timing.incoming * 2)
      const transitionFilters: string[] = []
      if (timing.incoming) {
        if (timing.name === 'Barrido lateral') {
          transitionFilters.push(`geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*lte(X,W*min(T/${transitionDuration},1))'`)
        } else if (timing.name !== 'Deslizar arriba') {
          transitionFilters.push(`fade=t=in:st=0:d=${transitionDuration}:alpha=1`)
        }
        if (timing.name === 'Zoom suave') transitionFilters.push(`scale=w='max(2,trunc(iw*(0.8+0.2*min(t/${transitionDuration},1))/2)*2)':h='max(2,trunc(ih*(0.8+0.2*min(t/${transitionDuration},1))/2)*2)':eval=frame`)
        if (timing.name === 'Desenfoque') {
          const commands = Array.from({ length: 13 }, (_, i) => `${s(timing.incoming * 2 * i / 12)} gblur@tr${idx} sigma ${(8 * (1 - i / 12)).toFixed(2)}`).join(';')
          transitionFilters.push(`sendcmd=c='${commands}'`, `gblur@tr${idx}=sigma=8:planes=7`)
        }
      }
      if (m.kind === 'text') {
        inputs.push('-f', 'lavfi', '-i', `color=c=black@0:s=${W}x${H}:r=${fps}:d=${s(clipDuration(clip))},format=rgba`)
      } else if (m.kind === 'image') {
        inputs.push('-loop', '1', '-framerate', fps, '-t', s(clipDuration(clip)), '-i', m.source!.path)
      } else {
        inputs.push('-ss', s(clip.sourceIn), '-t', s(clip.sourceOut - clip.sourceIn), '-i', m.source!.path)
      }
      const chain = [
        'setpts=PTS-STARTPTS',
        ...textFilter,
        ...(clip.reversed && m.kind === 'video' ? ['reverse'] : []),
        ...(clip.speed !== 1 && m.kind === 'video' ? [`setpts=PTS/${clip.speed}`] : []),
        `fps=${fps}`,
        `scale=${W}:${H}:force_original_aspect_ratio=decrease`,
        ...(t.scale !== 100 ? [`scale=iw*${(t.scale / 100).toFixed(3)}:ih*${(t.scale / 100).toFixed(3)}`] : []),
        ...(clip.effects ?? []).map((e) => EFFECT_FILTERS[e]),
        'format=yuva420p',
        ...(timing.incoming || timing.outgoing ? [`tpad=start_mode=clone:stop_mode=clone:start_duration=${s(timing.incoming)}:stop_duration=${s(timing.outgoing)}`] : []),
        ...transitionFilters,
        ...(t.opacity !== 100 ? [`colorchannelmixer=aa=${(t.opacity / 100).toFixed(3)}`] : []),
        ...(t.rotation ? [`rotate=${((t.rotation * Math.PI) / 180).toFixed(4)}:c=none:ow=rotw(${((t.rotation * Math.PI) / 180).toFixed(4)}):oh=roth(${((t.rotation * Math.PI) / 180).toFixed(4)})`] : []),
        ...transitionFades(seq, clip),
        `setpts=PTS+${s(start)}/TB`
      ]
      lines.push(`[${idx}:v]${chain.join(',')}[l${idx}]`)
      const next = `v${++step}`
      const x = `(W-w)/2+${Math.round((t.x / 100) * W)}`
      const y = `(H-h)/2+${Math.round((t.y / 100) * H)}` + (timing.incoming && timing.name === 'Deslizar arriba' ? `+H*(1-clip((t-${s(start)})/${transitionDuration},0,1))` : '')
      lines.push(`[${current}][l${idx}]overlay=x=${x}:y='${y}':eof_action=pass:${enable}[${next}]`)
      current = next
    }
  }

  // Audio: pistas de audio no silenciadas y el sonido de los videos.
  const audioLabels: string[] = []
  for (const clip of wantAudio ? seq.clips : []) {
    const track = trackOf.get(clip.trackId)
    const m = media.get(clip.mediaId)
    if (!track || !m?.source || m.status === 'missing' || !m.source.hasAudio) continue
    if (track.kind === 'audio' && track.muted) continue
    if (clip.volume === 0) continue
    let idx = inputIndex.get(clip.id)
    if (idx === undefined) {
      // Pista visual oculta: su sonido tampoco va. En MP3 no hay capas, asi que se abre aqui.
      if (track.kind === 'visual' && (wantVideo || track.hidden)) continue
      idx = n++
      inputs.push('-ss', s(clip.sourceIn), '-t', s(clip.sourceOut - clip.sourceIn), '-i', m.source!.path)
    }
    const delay = Math.round(clip.start / 1000)
    const chain = [
      'asetpts=PTS-STARTPTS',
      ...(clip.reversed ? ['areverse'] : []),
      ...atempoChain(clip.speed),
      `volume=${(clip.volume / 100).toFixed(2)}`,
      ...(clip.fadeIn ? [`afade=t=in:st=0:d=${s(clip.fadeIn)}`] : []),
      ...(clip.fadeOut ? [`afade=t=out:st=${s(Math.max(0, clipDuration(clip) - clip.fadeOut))}:d=${s(clip.fadeOut)}`] : []),
      'aformat=sample_rates=48000:channel_layouts=stereo',
      `adelay=${delay}|${delay}`
    ]
    const label = `a${idx}`
    lines.push(`[${idx}:a]${chain.join(',')}[${label}]`)
    audioLabels.push(label)
  }
  if (!wantAudio) {
    // sin rama de audio
  } else if (audioLabels.length) {
    lines.push(`${audioLabels.map((l) => `[${l}]`).join('')}amix=inputs=${audioLabels.length}:normalize=0:dropout_transition=0,apad,atrim=0:${s(total)}[aout]`)
  } else {
    lines.push(`anullsrc=r=48000:cl=stereo,atrim=0:${s(total)}[aout]`)
  }

  if (!wantVideo) {
    lines.shift() // el lienzo de fondo tampoco se usa
  } else if (format === 'png') {
    lines.push(`[${current}]trim=start=${s(job.frameAt ?? 0)},setpts=PTS-STARTPTS,format=rgb24[vout]`)
  } else if (format === 'gif') {
    lines.push(`[${current}]fps=15,scale='min(${W},640)':-2:flags=lanczos,split[g1][g2];[g1]palettegen[pal];[g2][pal]paletteuse[vout]`)
  } else {
    lines.push(`[${current}]format=yuv420p[vout]`)
  }

  const crf = CRF[job.quality]
  const gpuArgs = (encoder: string, q: number): string[] => {
    if (encoder.endsWith('_nvenc')) return ['-c:v', encoder, '-preset', 'p5', '-rc', 'vbr', '-cq', String(q), '-b:v', '0']
    if (encoder.endsWith('_qsv')) return ['-c:v', encoder, '-global_quality', String(q), '-preset', 'medium']
    return ['-c:v', encoder, '-quality', 'balanced', '-rc', 'cqp', '-qp_i', String(q), '-qp_p', String(q)]
  }
  const h264 = job.gpu?.h264 ? gpuArgs(job.gpu.h264, crf + 2) : ['-c:v', 'libx264', '-preset', PRESET[job.quality], '-crf', String(crf)]
  const hevc = job.gpu?.hevc ? gpuArgs(job.gpu.hevc, crf + 6) : ['-c:v', 'libx265', '-preset', PRESET[job.quality], '-crf', String(crf + 4)]
  const encode: Record<ExportFormat, string[]> = {
    mp4: ['-map', '[vout]', '-map', '[aout]', ...h264, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
    'mp4-hevc': ['-map', '[vout]', '-map', '[aout]', ...hevc, '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
    'mov-prores': ['-map', '[vout]', '-map', '[aout]', '-c:v', 'prores_ks', '-profile:v', job.quality === 'max' ? '3' : '2', '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s16le'],
    webm: ['-map', '[vout]', '-map', '[aout]', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf + 8), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-b:a', '160k'],
    gif: ['-map', '[vout]', '-loop', '0'],
    mp3: ['-map', '[aout]', '-c:a', 'libmp3lame', '-b:a', job.quality === 'low' ? '128k' : '256k'],
    png: ['-map', '[vout]', '-frames:v', '1']
  }

  const graphFile = `${job.workDir}/graph.txt`
  const args = [
    ...inputs,
    '-filter_complex_script', graphFile,
    ...encode[format],
    ...(format === 'mp3' || format === 'png' ? [] : ['-r', fps]),
    ...(format === 'png' ? [] : ['-t', s(total)]),
    job.output
  ]
  return { args, graph: lines.join(';\n'), textFiles, durationSeconds: total / 1_000_000, missing }
}
