import { useEffect } from 'react'
import { EditorLayout } from '@/features/editor/components/editor-layout'
import { useShortcuts } from '@/features/editor/hooks/use-shortcuts'
import { useEditor } from '@/features/editor/store/editor-store'
import { ExportDialog } from '@/features/project/components/export-dialog'
import { NewProjectDialog } from '@/features/project/components/new-project-dialog'
import { ShortcutsDialog } from '@/features/project/components/shortcuts-dialog'
import { StartScreen } from '@/features/start/components/start-screen'
import { Toast } from '@/shared/components/toast'
import { AgentPanel } from '@/features/agents/panel'
import { ProjectDecisionDialog, useCloseRequest } from '@/features/project/components/project-decision-dialog'
import { useProjectDecision } from '@/features/project/store/project-decision'

export function App() {
  const screen = useEditor((s) => s.screen)
  const dialog = useEditor((s) => s.dialog)
  const agentBusy = useEditor(s => s.agentBusy)
  useShortcuts()
  useCloseRequest()
  const decision = useProjectDecision(s => s.pending)
  useEffect(() => window.wonderfilm?.onMediaEvent((e) => useEditor.getState().applyMediaEvent(e)), [])
  useEffect(() => {
    void window.wonderfilm?.takeStartupProject().then(path => {
      if (path) return useEditor.getState().openProjectFile(path)
    }).catch(error => useEditor.getState().showToast(`No se pudo abrir el proyecto: ${String(error)}`))
  }, [])

  return (
    <>
      <div inert={Boolean(decision)} className="h-full">
      <div inert={agentBusy} className="h-full">{screen === 'start' ? <StartScreen /> : <EditorLayout />}</div>
      {dialog === 'new-project' && <NewProjectDialog />}
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
      <Toast />
      <AgentPanel />
      </div>
      <ProjectDecisionDialog />
    </>
  )
}
