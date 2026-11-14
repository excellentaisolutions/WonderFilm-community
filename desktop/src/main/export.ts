import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { buildExport } from '../shared/export-graph'
import type { ExportOutcome, ExportRequest } from '../shared/contracts'
import { ffmpeg, probe, runFfmpeg } from './ffmpeg'
import { sameFile } from './file-identity'

const FONTS = ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']

let running: ChildProcess | null = null

interface Gpu {
  label: string | null
  h264?: string
  hevc?: string
}
let gpu: Promise<Gpu> | null = null

const VENDORS = [
  { label: 'NVIDIA', h264: 'h264_nvenc', hevc: 'hevc_nvenc' },
  { label: 'Intel', h264: 'h264_qsv', hevc: 'hevc_qsv' },
  { label: 'AMD', h264: 'h264_amf', hevc: 'hevc_amf' }
]

/**
 * El codificador por GPU que de verdad funciona en esta maquina. Que ffmpeg lo liste no
 * basta: medido en un equipo con NVIDIA, qsv y amf aparecen en la lista y fallan al usarlos.
 */
export function detectGpu(): Promise<Gpu> {
  gpu ??= (async () => {
    const works = async (enc: string) => (await ffmpeg(['-v', 'error', '-f', 'lavfi', '-i', 'color=s=1280x720:d=0.3', '-c:v', enc, '-f', 'null', '-'])).code === 0
    for (const v of VENDORS) {
      if (await works(v.h264)) return { label: v.label, h264: v.h264, hevc: (await works(v.hevc)) ? v.hevc : undefined }
    }
    return { label: null }
  })()
  return gpu
}
let cancelled = false
let exporting = false
export const isExporting = () => exporting

export async function exportVideo(req: ExportRequest, onProgress: (fraction: number) => void): Promise<ExportOutcome> {
  if (exporting) return { ok: false, message: 'Ya hay una exportacion en curso' }
  if (req.media.some(m => m.source && [m.source.path, m.source.playPath].some(path => path && sameFile(req.output, path)))) {
    return { ok: false, message: 'No se puede sobrescribir un medio original. Elige otro archivo de salida.' }
  }
  exporting = true
  cancelled = false
  try { return await runExport(req, onProgress) } finally { exporting = false }
}

async function runExport(req: ExportRequest, onProgress: (fraction: number) => void): Promise<ExportOutcome> {
  const hw = req.useGpu === false ? undefined : await detectGpu()
  if (cancelled) return { ok: false, cancelled: true, message: 'Exportacion cancelada' }
  const workDir = mkdtempSync(join(tmpdir(), 'wonderfilm-export-'))
  try {
  const fontFile = FONTS.find((f) => existsSync(f)) ?? FONTS[0]
  const plan = buildExport({ ...req, workDir: workDir.replace(/\\/g, '/'), fontFile, gpu: hw?.label ? { h264: hw.h264, hevc: hw.hevc } : undefined })
  if (plan.missing.length) {
    return { ok: false, message: `Faltan archivos de origen: ${[...new Set(plan.missing)].join(', ')}` }
  }
  if (plan.durationSeconds <= 0) {
    return { ok: false, message: 'La linea de tiempo esta vacia' }
  }
  writeFileSync(join(workDir, 'graph.txt'), plan.graph)
  for (const t of plan.textFiles) writeFileSync(t.path, t.content)

  const run = runFfmpeg(plan.args, (sec) => onProgress(Math.min(0.99, sec / plan.durationSeconds)))
  running = run.child
  const result = await run.done
  running = null

  if (cancelled) {
    rmSync(req.output, { force: true })
    return { ok: false, cancelled: true, message: 'Exportacion cancelada' }
  }
  if (result.code !== 0 && plan.args.some((a) => /_(nvenc|qsv|amf)$/.test(a)) && !cancelled) {
    // Si la GPU falla (controlador, memoria, resolucion), se repite en software: nunca se
    // pierde una exportacion por intentar ir mas rapido.
    rmSync(req.output, { force: true })
    return runExport({ ...req, useGpu: false }, onProgress)
  }
  if (result.code !== 0 || !existsSync(req.output)) {
    rmSync(req.output, { force: true })
    const last = result.stderr.trim().split(/\r?\n/).slice(-6).join('\n')
    return { ok: false, message: 'FFmpeg no pudo terminar la exportacion', detail: last }
  }
  onProgress(1)
  let seconds = plan.durationSeconds
  try {
    seconds = Number((await probe(req.output)).format.duration ?? seconds)
  } catch {
    // La duracion medida es informativa: si ffprobe falla, el fichero ya existe.
  }
  return { ok: true, output: req.output, bytes: statSync(req.output).size, seconds }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

export function cancelExport(): void {
  if (!exporting) return
  cancelled = true
  running?.kill()
}
