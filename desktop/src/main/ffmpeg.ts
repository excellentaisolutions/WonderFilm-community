import { spawn, type ChildProcess } from 'node:child_process'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

// En el instalador los binarios viven fuera del asar (asarUnpack): no se puede ejecutar
// nada desde dentro de un archivo comprimido.
const unpacked = (p: string) => p.replace('app.asar', 'app.asar.unpacked')

export const FFMPEG = unpacked(ffmpegStatic as unknown as string)
export const FFPROBE = unpacked(ffprobeStatic.path)

export interface RunResult {
  code: number
  stderr: string
}

export interface Running {
  done: Promise<RunResult>
  child: ChildProcess
}

/** Lanza ffmpeg. `onProgress` recibe segundos procesados (de `-progress pipe:1`). */
export function runFfmpeg(args: string[], onProgress?: (seconds: number) => void): Running {
  const child = spawn(FFMPEG, ['-hide_banner', '-y', ...(onProgress ? ['-progress', 'pipe:1', '-nostats'] : []), ...args], {
    windowsHide: true
  })
  let stderr = ''
  child.stderr.on('data', (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-20000)
  })
  if (onProgress) {
    child.stdout.on('data', (d: Buffer) => {
      const m = /out_time_us=(\d+)/.exec(d.toString())
      if (m) onProgress(Number(m[1]) / 1_000_000)
    })
  }
  const done = new Promise<RunResult>((resolve) => {
    child.on('error', (e) => resolve({ code: -1, stderr: String(e) }))
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }))
  })
  return { done, child }
}

export async function ffmpeg(args: string[]): Promise<RunResult> {
  return runFfmpeg(args).done
}

export interface ProbeStream {
  codec_type: 'video' | 'audio' | string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  duration?: string
  nb_frames?: string
}

export interface ProbeResult {
  streams: ProbeStream[]
  format: { duration?: string; size?: string; format_name?: string }
}

export function probe(path: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path], {
      windowsHide: true
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.stderr.on('data', (d: Buffer) => (err += d.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `ffprobe salio con ${code}`))
      try {
        resolve(JSON.parse(out) as ProbeResult)
      } catch (e) {
        reject(e)
      }
    })
  })
}
