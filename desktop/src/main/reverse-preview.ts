import { app } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { probe, runFfmpeg, type Running } from './ffmpeg'
import { allowPath } from './media-protocol'

let directory: string | undefined
let running: Running | undefined
let closing = false
let queue = Promise.resolve()
const pending = new Map<string, Promise<string>>()

export function reversePreview(path: string, from: number, to: number): Promise<string> {
  const file = statSync(path)
  const key = createHash('sha256').update(JSON.stringify([path, file.size, file.mtimeMs, from, to])).digest('hex')
  const existing = pending.get(key)
  if (existing) return existing
  const task = queue.then(() => prepare(path, from, to, key))
  queue = task.then(() => undefined, () => undefined)
  pending.set(key, task)
  void task.catch(() => pending.delete(key))
  return task
}

async function encode(args: string[]) {
  if (closing) throw new Error('Vista previa cancelada al cerrar')
  running = runFfmpeg(args)
  const result = await running.done
  running = undefined
  if (result.code !== 0) throw new Error('No se pudo preparar la reproducción inversa')
}

async function prepare(path: string, from: number, to: number, key: string): Promise<string> {
  if (closing) throw new Error('Aplicación cerrándose')
  if (!directory) {
    const root = process.env.WONDERFILM_E2E_DIR ?? app.getPath('temp')
    mkdirSync(root, { recursive: true })
    directory = mkdtempSync(join(root, 'wonderfilm-reverse-'))
  }
  const output = join(directory, key + '.mp4')
  if (existsSync(output)) return output
  const work = mkdtempSync(join(directory, 'parts-'))
  try {
    const info = await probe(path)
    const video = info.streams.some(s => s.codec_type === 'video')
    const audio = info.streams.some(s => s.codec_type === 'audio')
    const rate = info.streams.find(s => s.codec_type === 'video')?.avg_frame_rate?.split('/').map(Number)
    const fps = rate && rate[1] ? rate[0] / rate[1] : 25
    const chunk = video && Number.isFinite(fps) && fps > 0 ? Math.max(1, Math.floor(5 * fps)) / fps : 5
    const files: string[] = []
    // Invertir por bloques limita la memoria de reverse/areverse, incluso en clips largos.
    for (let end = to; end > from + 0.000001; end -= chunk) {
      const start = Math.max(from, end - chunk)
      const part = join(work, `${files.length}.mkv`)
      await encode(['-ss', String(start), '-t', String(end - start), '-i', path,
        ...(video ? ['-vf', "scale=-2:'min(720,ih)',reverse,setpts=PTS-STARTPTS", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p'] : ['-vn']),
        ...(audio ? ['-af', 'areverse,asetpts=PTS-STARTPTS', '-c:a', 'pcm_s16le'] : ['-an']), part])
      files.push(part)
    }
    const list = join(work, 'list.txt')
    writeFileSync(list, files.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'))
    await encode(['-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'copy', ...(audio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']), '-movflags', '+faststart', output])
    allowPath(output)
    return output
  } catch (error) { rmSync(output, { force: true }); throw error }
  finally { rmSync(work, { recursive: true, force: true }) }
}

export async function closeReversePreviews() {
  closing = true
  running?.child.kill()
  await queue
  if (directory) rmSync(directory, { recursive: true, force: true })
  pending.clear()
}
