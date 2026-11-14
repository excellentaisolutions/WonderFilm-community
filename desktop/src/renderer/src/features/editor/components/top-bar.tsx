import { ChevronLeft, Download, Keyboard, Redo2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useEditor } from '@/features/editor/store/editor-store'
import { SCENARIOS, type Scenario } from '@/features/project/mock/scenarios'
import { fpsLabel } from '@/features/timeline/model/time'
import { LogoMark } from '@/shared/components/logo'
import { cx } from '@/shared/lib/seeded'

type Item = { label: string; keys?: string; run: () => void; disabled?: boolean } | 'sep'

function useMenus(): Record<string, Item[]> {
  const s = useEditor.getState()
  const hasSelection = useEditor((st) => st.selection.length > 0)
  const canUndo = useEditor((st) => st.past.length > 0)
  const canRedo = useEditor((st) => st.future.length > 0)
  const fit = () => window.dispatchEvent(new Event('wonderfilm:fit'))
  return {
    Archivo: [
      { label: 'Nuevo proyecto…', keys: 'Ctrl+N', run: () => s.setDialog('new-project') },
      { label: 'Abrir proyecto…', keys: 'Ctrl+O', run: () => void s.openProjectFile() },
      'sep',
      { label: 'Guardar', keys: 'Ctrl+S', run: () => void s.saveProject() },
      { label: 'Guardar como…', keys: 'Ctrl+Mayús+S', run: () => void s.saveProject(true) },
      'sep',
      { label: 'Importar medios…', keys: 'Ctrl+I', run: () => void s.importMedia() },
      { label: 'Exportar…', keys: 'Ctrl+E', run: () => s.setDialog('export') },
      'sep',
      { label: 'Volver al inicio', run: s.goHome }
    ],
    Editar: [
      { label: 'Deshacer', keys: 'Ctrl+Z', run: s.undo, disabled: !canUndo },
      { label: 'Rehacer', keys: 'Ctrl+Mayús+Z', run: s.redo, disabled: !canRedo },
      'sep',
      { label: 'Copiar', keys: 'Ctrl+C', run: s.copySelection, disabled: !hasSelection },
      { label: 'Pegar en el cabezal', keys: 'Ctrl+V', run: s.paste },
      { label: 'Duplicar', keys: 'Ctrl+D', run: s.duplicateSelection, disabled: !hasSelection },
      { label: 'Dividir en el cabezal', keys: 'Ctrl+B', run: s.split },
      'sep',
      { label: 'Borrar', keys: 'Supr', run: () => s.deleteSelection(false), disabled: !hasSelection },
      { label: 'Borrar con onda', keys: 'Mayús+Supr', run: () => s.deleteSelection(true), disabled: !hasSelection },
      { label: 'Seleccionar todo', keys: 'Ctrl+A', run: () => s.select(useEditor.getState().sequence.clips.map((c) => c.id)) }
    ],
    Ver: [
      { label: 'Acercar', keys: 'Ctrl++', run: () => s.setZoom(useEditor.getState().zoom * 1.5) },
      { label: 'Alejar', keys: 'Ctrl+−', run: () => s.setZoom(useEditor.getState().zoom / 1.5) },
      { label: 'Ajustar a la ventana', keys: 'Mayús+Z', run: fit },
      'sep',
      { label: 'Modo magnético', run: s.toggleMagnetic },
      { label: 'Imantado', keys: 'N', run: s.toggleSnapping }
    ],
    Ayuda: [{ label: 'Atajos de teclado', run: () => s.setDialog('shortcuts') }, { label: 'Integraciones IA', run: () => s.setDialog('agents') }]
  }
}

function SaveState() {
  const dirty = useEditor((s) => s.dirty)
  const savedAt = useEditor((s) => s.savedAt)
  const path = useEditor((s) => s.projectPath)
  const scenario = useEditor((s) => s.scenario)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  if (scenario) return <>Proyecto de ejemplo</>
  if (!path) return <>Sin guardar</>
  if (dirty) return <span className="text-accent">Cambios sin guardar</span>
  const mins = savedAt ? Math.floor((Date.now() - savedAt) / 60_000) : 0
  return <>{mins < 1 ? 'Guardado hace un momento' : `Guardado hace ${mins} min`}</>
}

export function TopBar() {
  const projectName = useEditor((s) => s.projectName)
  const sequence = useEditor((s) => s.sequence)
  const scenario = useEditor((s) => s.scenario)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const { goHome, setDialog, setScenario, undo, redo, setProjectName } = useEditor.getState()
  const menus = useMenus()
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <header className="relative z-40 flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <button className="btn-icon" onClick={goHome} aria-label="Volver al inicio" title="Volver al inicio">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <LogoMark size={20} />
      <nav className="flex items-center text-[13px] text-muted" onPointerDown={(e) => e.stopPropagation()}>
        {Object.entries(menus).map(([name, items]) => (
          <div key={name} className="relative">
            <button
              className={cx('rounded px-2 py-1 hover:bg-raised hover:text-ink', open === name && 'bg-raised text-ink')}
              onClick={() => setOpen(open === name ? null : name)}
              onMouseEnter={() => open && setOpen(name)}
              aria-haspopup="menu"
              aria-expanded={open === name}
            >
              {name}
            </button>
            {open === name && (
              <div role="menu" className="absolute left-0 top-8 w-64 rounded-lg border border-line bg-raised p-1 text-2xs shadow-2xl">
                {items.map((item, i) =>
                  item === 'sep' ? (
                    <div key={i} className="my-1 h-px bg-line" />
                  ) : (
                    <button
                      key={item.label}
                      role="menuitem"
                      disabled={item.disabled}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-ink hover:bg-base disabled:opacity-40"
                      onClick={() => {
                        setOpen(null)
                        item.run()
                      }}
                    >
                      {item.label}
                      {item.keys && <span className="font-mono text-[10px] text-muted">{item.keys}</span>}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="ml-2 flex items-center gap-0.5 border-l border-line pl-3">
        <button className="btn-icon" onClick={undo} disabled={!canUndo} aria-label="Deshacer" title="Deshacer (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </button>
        <button className="btn-icon" onClick={redo} disabled={!canRedo} aria-label="Rehacer" title="Rehacer (Ctrl+Mayús+Z)">
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-auto flex min-w-0 flex-col items-center leading-tight">
        <input
          aria-label="Nombre del proyecto"
          value={projectName}
          maxLength={80}
          onChange={(e) => setProjectName(e.target.value)}
          className="w-[320px] rounded bg-transparent text-center text-[13px] font-medium outline-none hover:bg-raised focus:bg-raised"
        />
        <span className="text-2xs text-muted">
          {sequence.width}×{sequence.height} · {fpsLabel(sequence.fps)} fps · <SaveState />
        </span>
      </div>

      {scenario && (
        <label className="flex items-center gap-2 rounded-md border border-dashed border-line px-2 py-1 text-2xs text-muted" title="Solo en el proyecto de ejemplo: cambia el estado de la maqueta">
          Estado
          <select className="bg-transparent text-ink outline-none" value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id} className="bg-panel">
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="btn-icon" onClick={() => setDialog('shortcuts')} aria-label="Atajos de teclado" title="Atajos de teclado">
        <Keyboard className="h-4 w-4" />
      </button>
      <button className="btn-primary h-8" onClick={() => setDialog('export')}>
        <Download className="h-4 w-4" /> Exportar
      </button>
    </header>
  )
}
