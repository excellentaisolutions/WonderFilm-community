import { CopyPlus, Crosshair, Magnet, MousePointer2, Plus, Scissors, Shrink, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { useState } from 'react'
import { MAX_ZOOM, MIN_ZOOM, useEditor } from '@/features/editor/store/editor-store'

export function TimelineToolbar({ onFit }: { onFit: () => void }) {
  const tool = useEditor((s) => s.tool)
  const magnetic = useEditor((s) => s.magnetic)
  const snapping = useEditor((s) => s.snapping)
  const zoom = useEditor((s) => s.zoom)
  const hasSelection = useEditor((s) => s.selection.length > 0)
  const { setTool, split, deleteSelection, duplicateSelection, toggleMagnetic, toggleSnapping, setZoom, addTrack, closeGaps } = useEditor.getState()
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      <div className="flex items-center gap-0.5 rounded-md bg-base p-0.5">
        <button className="btn-icon" aria-pressed={tool === 'select'} onClick={() => setTool('select')} aria-label="Selección" title="Selección (V)">
          <MousePointer2 className="h-4 w-4" />
        </button>
        <button className="btn-icon" aria-pressed={tool === 'razor'} onClick={() => setTool('razor')} aria-label="Cuchilla" title="Cuchilla (C)">
          <Scissors className="h-4 w-4" />
        </button>
      </div>
      <span className="mx-1 h-5 w-px bg-line" />
      <button className="btn-ghost h-7 px-2 text-2xs" onClick={split} title="Dividir en el cabezal (Ctrl+B)">
        <Scissors className="h-3.5 w-3.5" /> Dividir
      </button>
      <button className="btn-icon" onClick={() => deleteSelection(false)} disabled={!hasSelection} aria-label="Borrar" title="Borrar (Supr) · con onda: Mayús+Supr">
        <Trash2 className="h-4 w-4" />
      </button>
      <button className="btn-icon" onClick={duplicateSelection} disabled={!hasSelection} aria-label="Duplicar" title="Duplicar (Ctrl+D)">
        <CopyPlus className="h-4 w-4" />
      </button>
      <button className="btn-icon" onClick={closeGaps} aria-label="Cerrar huecos" title="Cerrar huecos de la pista seleccionada">
        <Shrink className="h-4 w-4" />
      </button>
      <span className="mx-1 h-5 w-px bg-line" />
      <button className="btn-ghost h-7 px-2 text-2xs" aria-pressed={magnetic} onClick={toggleMagnetic} title="Modo magnético: la pista principal no deja huecos">
        <Magnet className={magnetic ? 'h-3.5 w-3.5 text-accent' : 'h-3.5 w-3.5'} />
        <span className={magnetic ? 'text-accent' : ''}>Magnético</span>
      </button>
      <button className="btn-ghost h-7 px-2 text-2xs" aria-pressed={snapping} onClick={toggleSnapping} title="Imantado a bordes y cabezal (N)">
        <Crosshair className={snapping ? 'h-3.5 w-3.5 text-accent' : 'h-3.5 w-3.5'} />
        <span className={snapping ? 'text-accent' : ''}>Imantado</span>
      </button>
      <div className="relative">
        <button className="btn-ghost h-7 px-2 text-2xs" onClick={() => setAddOpen(!addOpen)} aria-expanded={addOpen}>
          <Plus className="h-3.5 w-3.5" /> Pista
        </button>
        {addOpen && (
          <div className="absolute left-0 top-8 z-40 w-40 rounded-md border border-line bg-raised p-1 shadow-xl" onMouseLeave={() => setAddOpen(false)}>
            {(['visual', 'audio'] as const).map((k) => (
              <button
                key={k}
                className="block w-full rounded px-2 py-1.5 text-left text-2xs hover:bg-base"
                onClick={() => {
                  addTrack(k)
                  setAddOpen(false)
                }}
              >
                {k === 'visual' ? 'Pista de vídeo' : 'Pista de audio'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button className="btn-icon" onClick={() => setZoom(zoom / 1.5)} disabled={zoom <= MIN_ZOOM} aria-label="Alejar" title="Alejar (Ctrl+−)">
          <ZoomOut className="h-4 w-4" />
        </button>
        <input
          type="range"
          aria-label="Zoom de la línea de tiempo"
          min={Math.log(MIN_ZOOM)}
          max={Math.log(MAX_ZOOM)}
          step={0.01}
          value={Math.log(zoom)}
          onChange={(e) => setZoom(Math.exp(Number(e.target.value)))}
          className="w-28 accent-[rgb(var(--c-accent))]"
        />
        <button className="btn-icon" onClick={() => setZoom(zoom * 1.5)} disabled={zoom >= MAX_ZOOM} aria-label="Acercar" title="Acercar (Ctrl++)">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button className="btn-ghost h-7 px-2 text-2xs" onClick={onFit} title="Ajustar a la ventana (Mayús+Z)">
          Ajustar
        </button>
      </div>
    </div>
  )
}
