import { useEditor } from '@/features/editor/store/editor-store'
import { Modal } from '@/shared/components/modal'

const SHORTCUTS: [string, string][] = [
  ['Reproducir / pausar', 'Espacio'],
  ['Herramienta de selección', 'V'],
  ['Herramienta cuchilla', 'C'],
  ['Dividir en el cabezal', 'Ctrl + B'],
  ['Borrar (deja hueco)', 'Supr'],
  ['Borrar con onda', 'Mayús + Supr'],
  ['Duplicar', 'Ctrl + D'],
  ['Copiar / pegar', 'Ctrl + C / Ctrl + V'],
  ['Agrupar / desagrupar', 'Ctrl + G / Ctrl + Mayús + G'],
  ['Deshacer / rehacer', 'Ctrl + Z / Ctrl + Mayús + Z'],
  ['Imantado', 'N'],
  ['Fotograma anterior / siguiente', '← / →'],
  ['Ir al inicio / final', 'Inicio / Fin'],
  ['Acercar / alejar', 'Ctrl + + / Ctrl + −'],
  ['Ajustar a la ventana', 'Mayús + Z']
]

export function ShortcutsDialog() {
  const setDialog = useEditor((s) => s.setDialog)
  return (
    <Modal title="Atajos de teclado" onClose={() => setDialog(null)}>
      <dl className="divide-y divide-line px-5 py-2">
        {SHORTCUTS.map(([action, keys]) => (
          <div key={action} className="flex items-center justify-between py-2">
            <dt className="text-muted">{action}</dt>
            <dd className="font-mono text-2xs">{keys}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
