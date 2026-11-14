import { useState } from 'react'
import { useEditor } from '@/features/editor/store/editor-store'
import type { Rational } from '@/features/timeline/model/types'
import { Modal } from '@/shared/components/modal'

const RESOLUTIONS = [
  { label: '1920 × 1080 (16:9)', w: 1920, h: 1080 },
  { label: '3840 × 2160 (16:9, 4K)', w: 3840, h: 2160 },
  { label: '1080 × 1920 (9:16)', w: 1080, h: 1920 },
  { label: '1080 × 1080 (1:1)', w: 1080, h: 1080 },
  { label: '1280 × 720 (16:9)', w: 1280, h: 720 }
]

export const FRAME_RATES: { label: string; fps: Rational }[] = [
  { label: '23,976', fps: { num: 24000, den: 1001 } },
  { label: '24', fps: { num: 24, den: 1 } },
  { label: '25', fps: { num: 25, den: 1 } },
  { label: '29,97', fps: { num: 30000, den: 1001 } },
  { label: '30', fps: { num: 30, den: 1 } },
  { label: '50', fps: { num: 50, den: 1 } },
  { label: '60', fps: { num: 60, den: 1 } }
]

export function NewProjectDialog() {
  const setDialog = useEditor((s) => s.setDialog)
  const createProject = useEditor((s) => s.createProject)
  const [name, setName] = useState('Proyecto sin título')
  const [res, setRes] = useState(0)
  const [rate, setRate] = useState(4)
  const trimmed = name.trim()

  return (
    <Modal title="Nuevo proyecto" onClose={() => setDialog(null)}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!trimmed) return
          createProject({ name: trimmed, width: RESOLUTIONS[res].w, height: RESOLUTIONS[res].h, fps: FRAME_RATES[rate].fps })
        }}
      >
        <label className="block space-y-1.5">
          <span className="label">Nombre</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
          {!trimmed && <span className="text-2xs text-danger">El proyecto necesita un nombre.</span>}
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="label">Resolución</span>
            <select className="field" value={res} onChange={(e) => setRes(Number(e.target.value))}>
              {RESOLUTIONS.map((r, i) => (
                <option key={r.label} value={i}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="label">Fotogramas por segundo</span>
            <select className="field" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
              {FRAME_RATES.map((r, i) => (
                <option key={r.label} value={i}>
                  {r.label} fps
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-2xs text-muted">Puedes cambiar la resolución y la cadencia más tarde, en los ajustes de la secuencia.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={() => setDialog(null)}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={!trimmed}>
            Crear proyecto
          </button>
        </div>
      </form>
    </Modal>
  )
}
