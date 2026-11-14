import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import ffmpegPath from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'
import { createClip } from '../renderer/src/features/timeline/model/operations'
import { SECOND, type Clip, type MediaItem, type Sequence } from '../renderer/src/features/timeline/model/types'
import { atempoChain, buildExport, graphPath } from './export-graph'

const S = SECOND
const FF = ffmpegPath as unknown as string

const video = (path: string, seconds: number, hasAudio = true): MediaItem => ({
  id: 'v', name: 'video.mp4', kind: 'video', duration: seconds * S, hue: 0, status: 'ready',
  source: { path, playPath: path, hasAudio }
})
const tone = (path: string): MediaItem => ({
  id: 'a', name: 'tono.m4a', kind: 'audio', duration: 10 * S, hue: 0, status: 'ready',
  source: { path, playPath: path, hasAudio: true }
})
const title: MediaItem = { id: 't', name: 'Titulo', kind: 'text', duration: null, hue: 0, status: 'ready' }

function sequence(clips: Clip[]): Sequence {
  return {
    id: 's', name: 's', width: 640, height: 360, fps: { num: 25, den: 1 }, sampleRate: 48000, channels: 2,
    tracks: [
      { id: 'v2', kind: 'visual', name: 'V2', locked: false, hidden: false, muted: false },
      { id: 'v1', kind: 'visual', name: 'V1', locked: false, hidden: false, muted: false },
      { id: 'a1', kind: 'audio', name: 'A1', locked: false, hidden: false, muted: false }
    ],
    clips
  }
}

const at = (m: MediaItem, track: string, start: number, len: number, from = 0, extra: Partial<Clip> = {}): Clip => ({
  ...createClip(m, track, start * S), sourceIn: from * S, sourceOut: (from + len) * S, ...extra
})

describe('grafo de exportacion (puro)', () => {
  it('un id de título de un proyecto no puede sacar escrituras del directorio temporal', () => {
    const c = { ...at(title, 'v2', 0, 2), id: 'nested/../../escaped' }
    const workDir = resolve('temp-owned')
    const plan = buildExport({ sequence: sequence([c]), media: [title], format: 'mp4', quality: 'high', output: 'o.mp4', workDir, fontFile: '/f.ttf' })
    expect(dirname(resolve(plan.textFiles[0].path))).toBe(workDir)
  })
  it('encadena atempo por debajo de 0,5', () => {
    expect(atempoChain(1)).toEqual([])
    expect(atempoChain(2)).toEqual(['atempo=2.0000'])
    expect(atempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.5000'])
  })

  it('escapa rutas de Windows para el grafo', () => {
    expect(graphPath('C:\\Fonts\\a.ttf')).toBe("'C\\:/Fonts/a.ttf'")
  })

  it('un clip sin fichero se declara como ausente, no se exporta en negro en silencio', () => {
    const mock: MediaItem = { id: 'm', name: 'muestra.mp4', kind: 'video', duration: 5 * S, hue: 0, status: 'ready' }
    const plan = buildExport({ sequence: sequence([at(mock, 'v1', 0, 5)]), media: [mock], format: 'mp4', quality: 'high', output: 'o.mp4', workDir: '/w', fontFile: '/f.ttf' })
    expect(plan.missing).toEqual(['muestra.mp4'])
  })

  it('el color del titulo y los fundidos de audio llegan al grafo', () => {
    const v = video('/v.mp4', 10)
    const plan = buildExport({
      sequence: sequence([at(v, 'v1', 0, 4, 0, { fadeIn: S, fadeOut: S / 2 }), { ...at(title, 'v2', 0, 2), text: 'x', textColor: '#f5a524' }]),
      media: [v, title], format: 'mp4', quality: 'high', output: 'o.mp4', workDir: '/w', fontFile: '/f.ttf'
    })
    expect(plan.graph).toContain('fontcolor=0xf5a524@1.00')
    expect(plan.graph).toContain('afade=t=in:st=0:d=1.0000')
    expect(plan.graph).toContain('afade=t=out:st=3.5000:d=0.5000')
  })

  it('las pistas ocultas no entran y las silenciadas no suenan', () => {
    const v = video('/v.mp4', 10)
    const a = tone('/a.m4a')
    const seq = sequence([at(v, 'v1', 0, 4), at(a, 'a1', 0, 4)])
    seq.tracks[1].hidden = true
    seq.tracks[2].muted = true
    const plan = buildExport({ sequence: seq, media: [v, a], format: 'mp4', quality: 'high', output: 'o.mp4', workDir: '/w', fontFile: '/f.ttf' })
    expect(plan.args.filter((x) => x === '-i')).toHaveLength(0)
    expect(plan.graph).toContain('anullsrc')
  })
})

describe.skipIf(!existsSync(FF) || !existsSync(ffprobe.path))('exportacion real con ffmpeg', () => {
  it('produce un fichero con la duracion, la resolucion y los flujos de la secuencia', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-export-'))
    try {
      const src = join(dir, 'barras.mp4')
      const snd = join(dir, 'tono.m4a')
      execFileSync(FF, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25:d=10', '-f', 'lavfi', '-i', 'sine=f=440:d=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src])
      execFileSync(FF, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=660:d=10', '-c:a', 'aac', snd])
      const v = video(src, 10)
      const a = tone(snd)
      const font = ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arial.ttf'].find(existsSync) ?? 'C:/Windows/Fonts/arial.ttf'
      const seq = sequence([
        at(v, 'v1', 0, 3, 0, { transitionOut: { name: 'Fundido a negro', duration: S }, effects: ['bw'] }),
        at(v, 'v1', 3, 2, 5, { speed: 2, sourceOut: 9 * S }),
        { ...at(title, 'v2', 1, 2), text: 'Hola: «WonderFilm» 100%', textColor: '#f5a524' },
        at(a, 'a1', 1, 4, 0, { volume: 50, fadeIn: S, fadeOut: S })
      ])
      const out = join(dir, 'salida.mp4')
      const work = dir.replace(/\\/g, '/')
      const plan = buildExport({ sequence: seq, media: [v, a, title], format: 'mp4', quality: 'low', output: out, workDir: work, fontFile: font })
      writeFileSync(join(dir, 'graph.txt'), plan.graph)
      for (const t of plan.textFiles) writeFileSync(t.path, t.content)
      execFileSync(FF, ['-y', '-v', 'error', ...plan.args])

      const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', out]).toString())
      const vs = info.streams.find((x: { codec_type: string }) => x.codec_type === 'video')
      expect(info.streams.some((x: { codec_type: string }) => x.codec_type === 'audio')).toBe(true)
      expect([vs.width, vs.height]).toEqual([640, 360])
      expect(Number(info.format.duration)).toBeGreaterThan(4.8)
      expect(Number(info.format.duration)).toBeLessThan(5.3)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)

  it.each(['gif', 'mp3', 'webm', 'png'] as const)('el formato %s produce un fichero valido', (format) => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-fmt-'))
    try {
      const src = join(dir, 'barras.mp4')
      execFileSync(FF, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=25:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src])
      const v = video(src, 3)
      const out = join(dir, 'salida.' + (format === 'gif' ? 'gif' : format))
      const plan = buildExport({ sequence: sequence([at(v, 'v1', 0, 2)]), media: [v], format, quality: 'low', output: out, workDir: dir.replace(/\\/g, '/'), fontFile: 'C:/Windows/Fonts/arial.ttf', frameAt: SECOND })
      writeFileSync(join(dir, 'graph.txt'), plan.graph)
      execFileSync(FF, ['-y', '-v', 'error', ...plan.args])
      const info = JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', out]).toString())
      const kinds = info.streams.map((x: { codec_type: string }) => x.codec_type)
      expect(kinds).toContain(format === 'mp3' ? 'audio' : 'video')
      if (format === 'mp3') expect(kinds).not.toContain('video')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
