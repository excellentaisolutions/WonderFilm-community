import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import type { MediaItem, MediaSource } from '../renderer/src/features/timeline/model/types'
import { FFMPEG, ffmpeg, probe, runFfmpeg, type ProbeResult } from './ffmpeg'
import { allowPath } from './media-protocol'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff'])
/** Lo que Chromium decodifica solo. Lo demas (ProRes, HEVC, DNxHD…) necesita proxy. */
const PLAYABLE_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1', 'theora'])
const PLAYABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le', 'pcm_u8'])
const PLAYABLE_CONTAINER = /mp4|mov|webm|matroska|ogg|mp3|wav|flac|aac/
export const PEAKS_PER_SECOND = 50

export function cacheRoot(): string {
  const dir = join(app.getPath('userData'), 'media-cache')
  mkdirSync(dir, { recursive: true })
  return dir
}

function cacheDirFor(path: string): string {
  const st = statSync(path)
  const key = createHash('sha1').update(`${path}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16)
  const dir = join(cacheRoot(), key)
  mkdirSync(dir, { recursive: true })
  return dir
}

function sizeLabel(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

function parseRate(r?: string): number | undefined {
  if (!r) return undefined
  const [n, d] = r.split('/').map(Number)
  return d ? n / d : n || undefined
}

interface Analysis {
  kind: MediaItem['kind']
  durationUs: number | null
  width?: number
  height?: number
  fps?: number
  hasAudio: boolean
  videoCodec?: string
  audioCodec?: string
  needsProxy: boolean
}

export function analyse(path: string, info: ProbeResult): Analysis {
  const video = info.streams.find((s) => s.codec_type === 'video')
  const audio = info.streams.find((s) => s.codec_type === 'audio')
  const format = info.format.format_name ?? ''
  const seconds = Number(info.format.duration ?? video?.duration ?? audio?.duration ?? 0)
  const isImage = IMAGE_EXT.has(extname(path).toLowerCase()) || /image2|_pipe$/.test(format)

  if (video && isImage) {
    return { kind: 'image', durationUs: null, width: video.width, height: video.height, hasAudio: false, needsProxy: false }
  }
  if (video && seconds > 0) {
    const okVideo = PLAYABLE_VIDEO.has(video.codec_name ?? '')
    const okAudio = !audio || PLAYABLE_AUDIO.has(audio.codec_name ?? '')
    return {
      kind: 'video',
      durationUs: Math.round(seconds * 1_000_000),
      width: video.width,
      height: video.height,
      fps: parseRate(video.avg_frame_rate) ?? parseRate(video.r_frame_rate),
      hasAudio: Boolean(audio),
      videoCodec: video.codec_name,
      audioCodec: audio?.codec_name,
      needsProxy: !okVideo || !okAudio || !PLAYABLE_CONTAINER.test(format)
    }
  }
  if (audio && seconds > 0) {
    const ok = PLAYABLE_AUDIO.has(audio.codec_name ?? '') && PLAYABLE_CONTAINER.test(format)
    return { kind: 'audio', durationUs: Math.round(seconds * 1_000_000), hasAudio: true, audioCodec: audio.codec_name, needsProxy: !ok }
  }
  throw new Error('No contiene video, audio ni imagen que se pueda usar')
}

/** Picos de amplitud, 50 por segundo, de 0 a 100. */
function computePeaks(path: string, out: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sampleRate = 4000
    const perPeak = sampleRate / PEAKS_PER_SECOND
    const child = spawn(FFMPEG, ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', 'pipe:1'], {
      windowsHide: true
    })
    const peaks: number[] = []
    let max = 0
    let count = 0
    let carry: Buffer | null = null
    child.stdout.on('data', (chunk: Buffer) => {
      const buf: Buffer = carry ? Buffer.concat([carry, chunk]) : chunk
      const usable = buf.length - (buf.length % 2)
      for (let i = 0; i < usable; i += 2) {
        max = Math.max(max, Math.abs(buf.readInt16LE(i)))
        if (++count === perPeak) {
          peaks.push(Math.min(100, Math.round((max / 32768) * 100)))
          max = 0
          count = 0
        }
      }
      carry = usable < buf.length ? buf.subarray(usable) : null
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0 && peaks.length === 0) return reject(new Error(`picos: ffmpeg salio con ${code}`))
      if (count) peaks.push(Math.min(100, Math.round((max / 32768) * 100)))
      writeFileSync(out, JSON.stringify(peaks))
      resolve()
    })
  })
}

export interface ImportEvents {
  added: (item: MediaItem) => void
  updated: (id: string, patch: Partial<MediaItem>) => void
  failed: (name: string, message: string) => void
}

/** Importa un fichero: primero lo minimo para verlo en la biblioteca, luego el resto. */
export async function importFile(path: string, events: ImportEvents, existingId?: string): Promise<void> {
  const name = basename(path)
  let info: ProbeResult
  let a: Analysis
  try {
    info = await probe(path)
    a = analyse(path, info)
  } catch (e) {
    events.failed(name, e instanceof Error ? e.message : String(e))
    return
  }

  const id = existingId ?? `media-${randomUUID().slice(0, 8)}`
  const dir = cacheDirFor(path)
  allowPath(path)
  const source: MediaSource = {
    path,
    playPath: path,
    hasAudio: a.hasAudio,
    fps: a.fps,
    codec: [a.videoCodec, a.audioCodec].filter(Boolean).join(' + ') || undefined
  }

  const thumb = join(dir, 'thumb.jpg')
  if (a.kind !== 'audio' && !existsSync(thumb)) {
    const at = a.durationUs ? Math.min(1, a.durationUs / 3_000_000) : 0
    await ffmpeg([...(a.kind === 'video' ? ['-ss', at.toFixed(2)] : []), '-i', path, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', thumb])
  }
  if (existsSync(thumb)) {
    allowPath(thumb)
    source.thumbPath = thumb
  }

  const hue = Number.parseInt(createHash('md5').update(path).digest('hex').slice(0, 2), 16) * 1.4
  const item: MediaItem = {
    id,
    name,
    kind: a.kind,
    duration: a.durationUs,
    width: a.width,
    height: a.height,
    hue: Math.round(hue),
    status: a.kind === 'image' ? 'ready' : 'importing',
    progress: 0.1,
    sizeLabel: sizeLabel(statSync(path).size),
    source
  }
  events.added(item)
  if (a.kind === 'image') return

  try {
    const seconds = (a.durationUs ?? 0) / 1_000_000
    if (a.kind === 'video') {
      const strip = join(dir, 'strip.jpg')
      const frames = Math.max(1, Math.min(60, Math.ceil(seconds / 2)))
      if (!existsSync(strip)) {
        await ffmpeg([
          '-skip_frame', 'nokey', '-i', path, '-an', '-vf',
          `fps=${frames}/${seconds.toFixed(3)},scale=96:54:force_original_aspect_ratio=increase,crop=96:54,tile=${frames}x1`,
          '-frames:v', '1', '-q:v', '5', strip
        ])
      }
      if (existsSync(strip)) {
        allowPath(strip)
        source.strip = { path: strip, frames, interval: seconds / frames }
      }
    }
    events.updated(id, { progress: 0.35, source: { ...source } })

    if (a.hasAudio) {
      const peaks = join(dir, 'peaks.json')
      if (!existsSync(peaks)) await computePeaks(path, peaks)
      allowPath(peaks)
      source.peaksPath = peaks
    }
    events.updated(id, { progress: a.needsProxy ? 0.5 : 1, source: { ...source } })

    if (a.needsProxy) {
      const proxy = join(dir, a.kind === 'video' ? 'proxy.mp4' : 'proxy.m4a')
      if (!existsSync(proxy)) {
        const args =
          a.kind === 'video'
            ? ['-i', path, '-vf', "scale=-2:'min(720,ih)'", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', proxy]
            : ['-i', path, '-vn', '-c:a', 'aac', '-b:a', '192k', proxy]
        const run = runFfmpeg(args, (s) => events.updated(id, { progress: 0.5 + 0.5 * Math.min(1, s / Math.max(seconds, 0.1)) }))
        const r = await run.done
        if (r.code !== 0) throw new Error('no se pudo generar el proxy de reproduccion')
      }
      allowPath(proxy)
      source.playPath = proxy
      source.proxy = true
    }
    events.updated(id, { status: 'ready', progress: 1, source: { ...source } })
  } catch (e) {
    // Lo esencial ya esta (duracion y miniatura): se puede montar aunque falte algo accesorio.
    events.updated(id, { status: 'ready', progress: 1, source: { ...source } })
    events.failed(name, `Importado con avisos: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Al abrir un proyecto: autoriza lo que ya existe y marca lo que falta. */
export function revalidate(items: MediaItem[]): MediaItem[] {
  return items.map((m) => {
    const s = m.source
    if (!s) return m
    if (!existsSync(s.path)) return { ...m, status: 'missing' }
    for (const p of [s.path, s.playPath, s.thumbPath, s.strip?.path, s.peaksPath]) if (p && existsSync(p)) allowPath(p)
    const playable = existsSync(s.playPath) ? s.playPath : s.path
    return { ...m, status: 'ready', progress: 1, source: { ...s, playPath: playable } }
  })
}
