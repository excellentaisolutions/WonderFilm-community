import { AlertTriangle, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useEditor } from '@/features/editor/store/editor-store'
import { dismissProjectDecision, requestProjectDecision, useProjectDecision } from '../store/project-decision'

export function useCloseRequest() {
  useEffect(() => window.wonderfilm?.onCloseRequested(() => {
    const s = useEditor.getState()
    if (!s.dirty && !s.saving) return window.wonderfilm?.confirmClose()
    s.setPlaying(false)
    requestProjectDecision('close', () => window.wonderfilm?.confirmClose())
  }), [])
}

export function ProjectDecisionDialog() {
  const pending = useProjectDecision(s => s.pending)
  return pending ? <DecisionContent key={pending.kind} /> : null
}

function useDecisionState() {
  const pending = useProjectDecision(s => s.pending)!
  const name = useEditor(s => s.projectName)
  const saving = useEditor(s => s.saving)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const waiting = saving || busy
  const replacing = pending.kind === 'replace'
  const waitingRef = useRef(waiting)
  waitingRef.current = waiting
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    useEditor.getState().setPlaying(false)
    cancel.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!waitingRef.current) dismissProjectDecision() }
      if (e.key !== 'Tab') return
      const buttons = Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary') ?? [])
      if (!buttons.length) { e.preventDefault(); return }
      const first = buttons[0], last = buttons.at(-1)!
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); previous?.focus() }
  }, [])
  const proceed = () => { dismissProjectDecision(); pending.proceed() }
  const save = async () => {
    setBusy(true); setError(null)
    const session = useEditor.getState().sessionId
    useEditor.getState().showToast(null)
    const ok = await useEditor.getState().saveProject()
    const current = useEditor.getState()
    setBusy(false)
    if (current.sessionId !== session) { dismissProjectDecision(); return }
    if (ok && !current.dirty) return proceed()
    setError(current.toast?.startsWith('No se pudo guardar:') ? current.toast : ok
      ? 'Se guardó una versión, pero hay cambios posteriores. Guarda de nuevo para continuar.'
      : 'El guardado no se completó. Puedes reintentarlo o seguir editando.')
  }
  const title = waiting ? 'Guardando tu proyecto…' : error ? 'No hemos podido completar el guardado'
    : replacing ? '¿Guardar antes de cambiar?' : '¿Guardar antes de salir?'
  return { name, waiting, error, box, cancel, replacing, proceed, save, title }
}

function DecisionContent() {
  const { name, waiting, error, box, cancel, replacing, proceed, save, title } = useDecisionState()
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6">
      <div ref={box} role="alertdialog" aria-modal="true" aria-labelledby="decision-title" aria-describedby="decision-description" aria-busy={waiting}
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-3 text-2xs text-muted">
          <span>WONDERFILM · PROYECTO</span>
          <button className="btn-icon" aria-label="Seguir editando" disabled={waiting} onClick={dismissProjectDecision}><X className="h-4 w-4" /></button>
        </header>
        <div className="p-6">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
            {waiting ? <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" /> : <AlertTriangle className="h-6 w-6" />}
          </div>
          <h2 id="decision-title" className="mb-2 text-xl font-semibold">{title}</h2>
          <p id="decision-description" className="text-sm leading-relaxed text-muted">{waiting
            ? 'Espera a que termine el guardado. Tu proyecto permanece abierto.'
            : error ? 'Tus cambios siguen abiertos. Puedes volver a intentarlo sin abandonar el editor.'
            : 'Hay cambios en tu montaje que aún no se han guardado. Guarda el proyecto para retomarlo tal como está.'}</p>
          <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-line bg-base px-4 py-3 text-2xs">
            <span className="min-w-0 break-words">{name}.wonderfilm</span><span className="shrink-0 text-accent">{waiting ? 'Guardando…' : 'Cambios pendientes'}</span>
          </div>
          {error && <details className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-2xs text-danger"><summary>Ver detalle</summary><p className="mt-2 break-words">{error}</p></details>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-base p-4">
          <button className="btn-ghost text-danger" disabled={waiting} onClick={proceed}>{replacing ? 'Descartar cambios' : 'Salir sin guardar'}</button>
          <button ref={cancel} className="btn-ghost" disabled={waiting} onClick={dismissProjectDecision}>Seguir editando</button>
          <button className="btn-primary" disabled={waiting} onClick={() => void save()}>{waiting ? 'Guardando…' : error ? 'Reintentar guardado' : replacing ? 'Guardar y continuar' : 'Guardar y salir'}</button>
        </footer>
      </div>
    </div>
  )
}
