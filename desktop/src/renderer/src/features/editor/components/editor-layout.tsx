import { InspectorPanel } from '@/features/inspector/components/inspector-panel'
import { LibraryPanel } from '@/features/library/components/library-panel'
import { PreviewPanel } from '@/features/preview/components/preview-panel'
import { TimelinePanel } from '@/features/timeline/components/timeline-panel'
import { useEffect } from 'react'
import { usePlayback } from '../hooks/use-playback'
import { useEditor } from '../store/editor-store'
import { TopBar } from './top-bar'
import { useProjectDecision } from '@/features/project/store/project-decision'

const AUTOSAVE_MS = 120_000

export function EditorLayout() {
  usePlayback()
  // Guardado automatico: solo si el proyecto ya tiene archivo, y nunca a mitad de un gesto.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = useEditor.getState()
      if (s.projectPath && s.dirty && !s.playing && !s.dialog && !s.preview && !useProjectDecision.getState().pending) void s.saveProject(false, true)
    }, AUTOSAVE_MS)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LibraryPanel />
        <PreviewPanel />
        <InspectorPanel />
      </div>
      <TimelinePanel />
    </div>
  )
}
