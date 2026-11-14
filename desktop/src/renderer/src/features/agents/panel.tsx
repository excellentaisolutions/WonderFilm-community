import { useEffect, useState, useMemo } from 'react'
import { Modal } from '@/shared/components/modal'
import { useEditor } from '../editor/store/editor-store'
import { executeAgent } from './commands'
import type { AgentStatus } from '../../../../shared/agent-schema'
import { activityIndicator } from './activity-indicator'

export function AgentPanel() {
  const dialog = useEditor(s => s.dialog)
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const indicator = useMemo(() => activityIndicator(setShowActivity), [])
  useEffect(() => { indicator.update(status?.busy ?? false) }, [indicator, status?.busy])
  useEffect(() => () => indicator.dispose(), [indicator])
  useEffect(() => {
    const b = window.wonderfilm; if (!b) return
    const update = (value: AgentStatus) => { setStatus(value); useEditor.setState({ agentBusy: value.busy }) }
    void b.agentStatus().then(update).catch(e => setError(String(e)))
    const offState = b.onAgentState(update)
    const offCommand = b.onAgentCommand(command => { void executeAgent(command).then(result => b.agentReply({ id: command.id, result }), e => b.agentReply({ id: command.id, error: e instanceof Error ? e.message : String(e) })) })
    return () => { offState(); offCommand() }
  }, [])
  const action = async (run: () => Promise<unknown>) => { setError(''); try { await run() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  const close = () => useEditor.getState().setDialog(null)
  return <>
    {showActivity && dialog !== 'agents' && <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-lg border border-accent bg-panel px-5 py-3 shadow-xl" role="status">
      <span>Agente trabajando en el proyecto…</span><button className="btn-ghost" onClick={() => useEditor.getState().setDialog('agents')}>Ver actividad</button>
    </div>}
    {dialog === 'agents' && <Modal title="Integraciones IA" onClose={close} width="max-w-2xl">
      <div className="max-h-[75vh] space-y-4 overflow-auto p-5 text-sm">
        <p className="text-muted">Conecta tu agente para importar vídeos, editar este proyecto y exportar. Los cambios aparecen en la línea de tiempo.</p>
        <label className="flex items-center gap-3"><input type="checkbox" checked={status?.enabled ?? false} onChange={e => void action(() => window.wonderfilm!.agentEnable(e.target.checked))} />Permitir conexiones locales</label>
        <p className="text-xs text-muted">Solo esta cuenta de Windows. La conexión permite leer medios y modificar archivos de proyectos. Puedes revocarla en cualquier momento.</p>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={!status} onClick={() => void action(async () => { await navigator.clipboard.writeText(JSON.stringify(status?.mcp, null, 2)); setCopied(true) })}>{copied ? 'Configuración copiada' : 'Copiar configuración MCP'}</button>
          <button className="btn-ghost" disabled={!status?.enabled} onClick={() => void action(() => window.wonderfilm!.agentRevoke())}>Revocar acceso</button>
        </div>
        {error && <p role="alert" className="text-red-400">{error}</p>}
        <h3 className="font-semibold">Trabajos de exportación</h3>
        {!status?.jobs.length && <p className="text-muted">No hay trabajos todavía.</p>}
        {status?.jobs.map(j => <div key={j.id} className="rounded border border-line p-2"><div>{({ running: 'Exportando', cancelling: 'Cancelando', cancelled: 'Cancelado', completed: 'Terminado', failed: 'Error' } as Record<string, string>)[j.status] ?? j.status} · {Math.round(j.progress * 100)} %</div>{j.error && <p className="text-red-400">{j.error}</p>}{j.status === 'running' && <button className="btn-ghost" onClick={() => void action(() => window.wonderfilm!.cancelExport())}>Cancelar exportación</button>}</div>)}
        <h3 className="font-semibold">Actividad reciente</h3>
        {!status?.activity.length && <p className="text-muted">Esperando al agente.</p>}
        {status?.activity.map((a, i) => <div key={`${a.at}-${i}`} className="flex flex-wrap gap-2 border-b border-line py-1 text-xs"><span>{new Date(a.at).toLocaleTimeString()}</span><span>{a.client}</span><span>{a.method}</span><span>{a.status}</span></div>)}
        <p className="text-xs text-muted">El acceso empieza desactivado. Copia la configuración a un cliente MCP local. Guarda el proyecto antes de sustituirlo. Los archivos originales se conservan.</p>
      </div>
    </Modal>}
  </>
}
