import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, basename } from 'node:path'
import type { ExportRequest } from '../shared/contracts'

vi.mock('./ffmpeg', () => ({ ffmpeg: vi.fn(), runFfmpeg: vi.fn(), probe: vi.fn() }))
import { ffmpeg, runFfmpeg } from './ffmpeg'

const dirs: string[] = []
afterEach(() => {
  vi.resetAllMocks()
  for (const dir of dirs.splice(0)) {
    if (dirname(resolve(dir)) === resolve(tmpdir()) && basename(dir).startsWith('wonderfilm-export-test-')) rmSync(dir, { recursive: true, force: true })
  }
})

it('cancelar durante la detección de GPU impide iniciar FFmpeg', async () => {
  vi.resetModules()
  let finishDetection!: (result: { code: number; stderr: string }) => void
  vi.mocked(ffmpeg).mockImplementationOnce(() => new Promise(resolve => { finishDetection = resolve }))
  vi.mocked(ffmpeg).mockResolvedValue({ code: 1, stderr: 'no GPU' })
  vi.mocked(runFfmpeg).mockReturnValue({ child: { kill: vi.fn() } as never, done: Promise.resolve({ code: 1, stderr: 'should not start' }) })
  const dir = mkdtempSync(join(tmpdir(), 'wonderfilm-export-test-')); dirs.push(dir)
  const req: ExportRequest = {
    sequence: { id: 's', name: 's', width: 640, height: 360, fps: { num: 25, den: 1 }, sampleRate: 48000, channels: 2,
      tracks: [{ id: 'v', name: 'V', kind: 'visual', locked: false, muted: false, hidden: false }],
      clips: [{ id: 'c', mediaId: 't', trackId: 'v', start: 0, sourceIn: 0, sourceOut: 1000000, speed: 1, reversed: false, volume: 100, text: 'QA', transform: { opacity: 100, scale: 100, x: 0, y: 0, rotation: 0 } }] },
    media: [{ id: 't', name: 'QA', kind: 'text', duration: null, hue: 0, status: 'ready' }],
    output: join(dir, 'out.mp4'), format: 'mp4', quality: 'high'
  }
  const { exportVideo, cancelExport, isExporting } = await import('./export')
  const result = exportVideo(req, () => {})
  expect(isExporting()).toBe(true)
  cancelExport()
  finishDetection({ code: 1, stderr: 'no GPU' })
  expect(await result).toMatchObject({ ok: false, cancelled: true })
  expect(runFfmpeg).not.toHaveBeenCalled()
  expect(isExporting()).toBe(false)
  expect(existsSync(req.output)).toBe(false)
})
