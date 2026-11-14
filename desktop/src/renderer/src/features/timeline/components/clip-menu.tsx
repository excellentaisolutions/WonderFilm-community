import { useEffect } from 'react'
import { useEditor } from '@/features/editor/store/editor-store'

export interface MenuState {
  x: number
  y: number
}

type Item = { label: string; keys?: string; run: () => void; danger?: boolean } | 'sep'

export function ClipMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const s = useEditor.getState()
  const grouped = useEditor((st) => st.sequence.clips.some((c) => st.selection.includes(c.id) && c.groupId))
  const multi = useEditor((st) => st.selection.length > 1)

  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  const items: Item[] = [
    { label: 'Dividir en el cabezal', keys: 'Ctrl+B', run: s.split },
    { label: 'Recortar inicio hasta el cabezal', run: () => s.trimSelectionToPlayhead('start') },
    { label: 'Recortar final hasta el cabezal', run: () => s.trimSelectionToPlayhead('end') },
    'sep',
    { label: 'Copiar', keys: 'Ctrl+C', run: s.copySelection },
    { label: 'Pegar en el cabezal', keys: 'Ctrl+V', run: s.paste },
    { label: 'Duplicar', keys: 'Ctrl+D', run: s.duplicateSelection },
    'sep',
    ...(multi ? [{ label: 'Agrupar', keys: 'Ctrl+G', run: s.groupSelection }] : []),
    ...(grouped ? [{ label: 'Desagrupar', keys: 'Ctrl+Mayús+G', run: s.ungroupSelection }] : []),
    { label: 'Cerrar huecos de la pista', run: s.closeGaps },
    'sep',
    { label: 'Borrar', keys: 'Supr', run: () => s.deleteSelection(false), danger: true },
    { label: 'Borrar con onda', keys: 'Mayús+Supr', run: () => s.deleteSelection(true), danger: true }
  ]

  return (
    <div
      role="menu"
      className="fixed z-50 w-64 rounded-lg border border-line bg-raised p-1 text-2xs shadow-2xl"
      style={{ left: Math.min(menu.x, window.innerWidth - 270), top: Math.min(menu.y, window.innerHeight - 380) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item === 'sep' ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-base ${item.danger ? 'text-danger' : ''}`}
            onClick={() => {
              item.run()
              onClose()
            }}
          >
            {item.label}
            {item.keys && <span className="font-mono text-[10px] text-muted">{item.keys}</span>}
          </button>
        )
      )}
    </div>
  )
}
