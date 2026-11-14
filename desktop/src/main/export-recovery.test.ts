import { it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import type { ExportRequest } from '../shared/contracts'

vi.mock('./ffmpeg', async (original) => {
  const real = await original<typeof import('./ffmpeg')>()
  return { ...real, ffmpeg: vi.fn(real.ffmpeg), runFfmpeg: vi.fn(real.runFfmpeg) }
})

it('un fallo real de codificador vuelve a software y produce vídeo decodificable', async () => {
  const root = tmpdir()
  mkdirSync(root, { recursive: true })
  const dir = mkdtempSync(join(root, 'wonderfilm-recovery-'))
  const real = await vi.importActual<typeof import('./ffmpeg')>('./ffmpeg')
  const mocked = await import('./ffmpeg')
  // La disponibilidad GPU se simula; la caída del encoder y el reintento ejecutan FFmpeg real.
  vi.mocked(mocked.ffmpeg).mockResolvedValue({ code: 0, stderr: '' })
  vi.mocked(mocked.runFfmpeg).mockImplementationOnce((args, progress) =>
    real.runFfmpeg(args.map(arg => arg === 'h264_nvenc' ? 'qa_missing_encoder' : arg), progress))
  const request: ExportRequest = {
    sequence: { id: 's', name: 'Recovery', width: 640, height: 360, fps: { num: 25, den: 1 }, sampleRate: 48000, channels: 2,
      tracks: [{ id: 'v', name: 'V', kind: 'visual', locked: false, muted: false, hidden: false }],
      clips: [{ id: 'c', mediaId: 't', trackId: 'v', start: 0, sourceIn: 0, sourceOut: 1000000, speed: 1, reversed: false, volume: 100, text: 'Recuperación', transform: { opacity: 100, scale: 100, x: 0, y: 0, rotation: 0 } }] },
    media: [{ id: 't', name: 'Recuperación', kind: 'text', duration: null, hue: 0, status: 'ready' }],
    output: join(dir, 'recovered.mp4'), format: 'mp4', quality: 'high'
  }
  try {
    const { exportVideo, isExporting } = await import('./export')
    const result = await exportVideo(request, () => {})
    expect(result.ok).toBe(true)
    expect(mocked.runFfmpeg).toHaveBeenCalledTimes(2)
    expect(vi.mocked(mocked.runFfmpeg).mock.calls[0][0]).toContain('h264_nvenc')
    expect(vi.mocked(mocked.runFfmpeg).mock.calls[1][0]).toContain('libx264')
    expect(isExporting()).toBe(false)
    const metadata = await real.probe(request.output)
    expect(metadata.streams.find(s => s.codec_type === 'video')).toMatchObject({ codec_name: 'h264', width: 640, height: 360 })
    expect((await real.ffmpeg(['-v', 'error', '-i', request.output, '-f', 'null', '-'])).code).toBe(0)
    const reportDir = resolve('qa/artifacts')
    mkdirSync(reportDir, { recursive: true })
    writeFileSync(join(reportDir, 'recovery.json'), JSON.stringify({ testedAt: new Date().toISOString(), detection: 'simulated NVIDIA availability', failure: 'real FFmpeg invalid encoder', fallback: 'real libx264', decoded: true, hardwareFailure: 'not verified' }, null, 2))
  } finally {
    vi.restoreAllMocks()
    if (dirname(resolve(dir)) === resolve(root)) rmSync(dir, { recursive: true, force: true })
    expect(existsSync(dir)).toBe(false)
  }
}, 30000)
