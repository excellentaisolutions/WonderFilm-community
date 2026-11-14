import { AlertTriangle, CheckCircle2, FolderOpen, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { bridge, findMedia, useEditor, usedAndOwnMedia } from '@/features/editor/store/editor-store'
import { sequenceDuration } from '@/features/timeline/model/operations'
import { formatShort } from '@/features/timeline/model/time'
import { SECOND } from '@/features/timeline/model/types'
import { Modal } from '@/shared/components/modal'
import type { ExportFormat, ExportQuality } from '../../../../../shared/export-graph'

type Phase = 'settings' | 'rendering' | 'done' | 'error'

const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: 'mp4', label: 'MP4 (H.264)' },
  { id: 'mp4-hevc', label: 'MP4 (H.265 / HEVC)' },
  { id: 'mov-prores', label: 'MOV (ProRes 422)' },
  { id: 'webm', label: 'WebM (VP9)' },
  { id: 'gif', label: 'GIF animado' },
  { id: 'mp3', label: 'Solo audio (MP3)' }
]
const QUALITY: { id: ExportQuality; label: string; mbPerSecond: number }[] = [
  { id: 'low', label: 'Baja — archivo pequeño', mbPerSecond: 0.4 },
  { id: 'medium', label: 'Media', mbPerSecond: 0.9 },
  { id: 'high', label: 'Alta (recomendada)', mbPerSecond: 1.8 },
  { id: 'max', label: 'Máxima', mbPerSecond: 3.6 }
]

const sizeLabel = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`)

export function ExportDialog() {
  const setDialog = useEditor((s) => s.setDialog)
  const sequence = useEditor((s) => s.sequence)
  const media = useEditor((s) => s.media)
  const projectName = useEditor((s) => s.projectName)
  const used = [...new Set(sequence.clips.map((c) => c.mediaId))].map((id) => findMedia(media, id)).filter((m) => m && m.kind !== 'text') as typeof media
  const missing = used.some((m) => m.status === 'missing')
  const sampleOnly = used.length > 0 && used.every((m) => !m.source)
  const importing = used.some((m) => m.status === 'importing')
  const [phase, setPhase] = useState<Phase>('settings')
  const [progress, setProgress] = useState(0)
  const [format, setFormat] = useState<ExportFormat>('mp4')
  const [quality, setQuality] = useState<ExportQuality>('high')
  const [fileName, setFileName] = useState(projectName)
  const [result, setResult] = useState<{ path: string; bytes: number; seconds: number } | null>(null)
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null)
  const unsub = useRef<(() => void) | null>(null)
  const duration = sequenceDuration(sequence)
  const empty = duration === 0
  const b = bridge()
  const [gpuName, setGpuName] = useState<string | null>(null)
  const [useGpu, setUseGpu] = useState(true)

  useEffect(() => () => unsub.current?.(), [])
  useEffect(() => {
    void b?.exportHardware().then(setGpuName)
  }, [b])

  // Sin la app de escritorio (revision del diseño) se simula, como en la fase 1.
  useEffect(() => {
    if (b || phase !== 'rendering') return
    const id = window.setInterval(() => {
      setProgress((p) => {
        if (missing && p > 0.45) {
          setError({ message: 'Faltan archivos de origen que usa la línea de tiempo.' })
          setPhase('error')
          return p
        }
        if (p >= 1) {
          setResult({ path: `${fileName}.mp4`, bytes: (duration / SECOND) * 1.8e6, seconds: duration / SECOND })
          setPhase('done')
          return 1
        }
        return Math.min(1, p + 0.04)
      })
    }, 120)
    return () => window.clearInterval(id)
  }, [b, phase, missing, fileName, duration])

  const start = async () => {
    setProgress(0)
    setError(null)
    if (!b) return setPhase('rendering')
    const output = await b.chooseExportPath(fileName.trim(), format)
    if (!output) return
    setPhase('rendering')
    unsub.current = b.onExportProgress(setProgress)
    const outcome = await b.startExport({ sequence, media: usedAndOwnMedia(media, sequence), format, quality, output, useGpu })
    unsub.current?.()
    unsub.current = null
    if (outcome.ok) {
      setResult({ path: outcome.output, bytes: outcome.bytes, seconds: outcome.seconds })
      setPhase('done')
    } else if (outcome.cancelled) {
      setPhase('settings')
    } else {
      setError({ message: outcome.message, detail: outcome.detail })
      setPhase('error')
    }
  }

  const close = () => {
    if (phase === 'rendering') return
    setDialog(null)
  }
  const blocked = empty || !fileName.trim() || sampleOnly || importing

  return (
    <Modal title="Exportar vídeo" onClose={close} width="max-w-xl">
      {phase === 'settings' && (
        <div className="space-y-4 p-5">
          <label className="block space-y-1.5">
            <span className="label">Nombre del archivo</span>
            <input className="field" value={fileName} onChange={(e) => setFileName(e.target.value)} maxLength={120} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="label">Formato</span>
              <select className="field" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                {FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="label">Calidad</span>
              <select className="field" value={quality} onChange={(e) => setQuality(e.target.value as ExportQuality)} disabled={format === 'gif'}>
                {QUALITY.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <dl className="grid grid-cols-3 gap-3 rounded-lg border border-line bg-base/60 p-3 text-2xs">
            <div>
              <dt className="text-muted">Resolución</dt>
              <dd className="mt-0.5 font-mono">{format === 'mp3' ? '—' : `${sequence.width}×${sequence.height}`}</dd>
            </div>
            <div>
              <dt className="text-muted">Duración</dt>
              <dd className="mt-0.5 font-mono">{formatShort(duration)}</dd>
            </div>
            <div>
              <dt className="text-muted">Tamaño estimado</dt>
              <dd className="mt-0.5 font-mono">~{Math.max(1, Math.round((duration / SECOND) * QUALITY.find((q) => q.id === quality)!.mbPerSecond * (format === 'mov-prores' ? 8 : 1)))} MB</dd>
            </div>
          </dl>
          {gpuName && (format === 'mp4' || format === 'mp4-hevc') && (
            <label className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-2xs">
              <span>
                Acelerar con la tarjeta gráfica <span className="text-muted">({gpuName})</span>
              </span>
              <input type="checkbox" checked={useGpu} onChange={(e) => setUseGpu(e.target.checked)} className="accent-[rgb(var(--c-accent))]" />
            </label>
          )}
          <p className="text-2xs text-muted">Al pulsar Exportar elegirás dónde guardarlo.</p>
          {empty && <p className="text-2xs text-danger">La línea de tiempo está vacía: añade algún clip antes de exportar.</p>}
          {sampleOnly && <p className="text-2xs text-accent">El proyecto de ejemplo usa medios de muestra sin archivo. Importa tus vídeos para exportar uno de verdad.</p>}
          {importing && <p className="text-2xs text-accent">Espera a que terminen de importarse los medios.</p>}
          {missing && !empty && (
            <p className="flex items-center gap-2 text-2xs text-accent">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Hay medios desconectados en la línea de tiempo. Vuelve a vincularlos o la exportación fallará.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={close}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={blocked} onClick={() => void start()}>
              Exportar
            </button>
          </div>
        </div>
      )}

      {phase === 'rendering' && (
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <p className="font-medium">Exportando «{fileName}»…</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-base">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="font-mono text-2xs text-muted">
            {Math.round(progress * 100)} % · {FORMATS.find((f) => f.id === format)!.label}
          </p>
          <div className="flex justify-end">
            <button className="btn-ghost" onClick={() => (b ? void b.cancelExport() : setPhase('settings'))}>
              Cancelar exportación
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-4 p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-clip-audio" />
          <p className="font-medium">Vídeo exportado</p>
          <p className="break-all text-2xs text-muted">{result.path}</p>
          <p className="font-mono text-2xs text-muted">
            {sizeLabel(result.bytes)} · {formatShort(result.seconds * SECOND)}
          </p>
          <div className="flex justify-center gap-2">
            <button className="btn-ghost border border-line" onClick={() => void b?.reveal(result.path)} disabled={!b}>
              <FolderOpen className="h-4 w-4" /> Abrir carpeta
            </button>
            <button className="btn-primary" onClick={close}>
              Listo
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-4 p-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-danger" />
          <p className="font-medium">No se pudo terminar la exportación</p>
          <p className="mx-auto max-w-sm text-2xs text-muted">{error?.message}</p>
          {error?.detail && (
            <pre className="mx-auto max-h-32 max-w-md overflow-auto whitespace-pre-wrap rounded bg-base p-2 text-left font-mono text-[10px] text-muted">{error.detail}</pre>
          )}
          <div className="flex justify-center gap-2">
            <button className="btn-ghost" onClick={close}>
              Cerrar
            </button>
            <button className="btn-primary" onClick={() => setPhase('settings')}>
              Volver a los ajustes
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
