import { useEffect } from 'react'
import { sequenceDuration } from '@/features/timeline/model/operations'
import { frameDuration } from '@/features/timeline/model/time'
import { useEditor } from '../store/editor-store'
import { useProjectDecision } from '@/features/project/store/project-decision'

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState()
      if (s.agentBusy || useProjectDecision.getState().pending) return
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      // Los de archivo valen tambien escribiendo y desde el inicio: son de la aplicacion.
      const global: [boolean, () => void][] = [
        [ctrl && key === 's', () => void s.saveProject(e.shiftKey)],
        [ctrl && key === 'o', () => void s.openProjectFile()],
        [ctrl && key === 'n', () => s.setDialog('new-project')]
      ]
      const g = !s.dialog && global.find(([match]) => match)
      if (g) {
        e.preventDefault()
        if (s.screen === 'editor' || key !== 's') g[1]()
        return
      }
      if (s.screen !== 'editor' || s.dialog || isTyping(e.target)) return
      const frame = frameDuration(s.sequence.fps)

      const actions: [boolean, () => void][] = [
        [key === ' ', () => s.setPlaying(!s.playing)],
        [!ctrl && key === 'v', () => s.setTool('select')],
        [!ctrl && key === 'c', () => s.setTool('razor')],
        [!ctrl && key === 'n', s.toggleSnapping],
        [ctrl && key === 'b', s.split],
        [ctrl && key === 'i', () => void s.importMedia()],
        [ctrl && key === 'e', () => s.setDialog('export')],
        [key === 'delete' || key === 'backspace', () => s.deleteSelection(e.shiftKey)],
        [ctrl && key === 'd', s.duplicateSelection],
        [ctrl && key === 'c', s.copySelection],
        [ctrl && key === 'v', s.paste],
        [ctrl && key === 'g' && !e.shiftKey, s.groupSelection],
        [ctrl && key === 'g' && e.shiftKey, s.ungroupSelection],
        [ctrl && key === 'z' && !e.shiftKey, s.undo],
        [ctrl && ((key === 'z' && e.shiftKey) || key === 'y'), s.redo],
        [ctrl && key === 'a', () => s.select(s.sequence.clips.map((c) => c.id))],
        [key === 'arrowleft', () => s.setPlayhead(s.playhead - frame * (e.shiftKey ? 10 : 1))],
        [key === 'arrowright', () => s.setPlayhead(s.playhead + frame * (e.shiftKey ? 10 : 1))],
        [key === 'home', () => s.setPlayhead(0)],
        [key === 'end', () => s.setPlayhead(sequenceDuration(s.sequence))],
        [ctrl && (key === '+' || key === '='), () => s.setZoom(s.zoom * 1.5)],
        [ctrl && key === '-', () => s.setZoom(s.zoom / 1.5)],
        [!ctrl && e.shiftKey && key === 'z', () => window.dispatchEvent(new Event('wonderfilm:fit'))],
        [key === 'escape', () => s.select([])]
      ]
      const hit = actions.find(([match]) => match)
      if (!hit) return
      e.preventDefault()
      hit[1]()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
