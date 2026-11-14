import { AlertTriangle, Clock, FolderOpen, Plus, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { bridge, useEditor } from '@/features/editor/store/editor-store'
import { RECENT_PROJECTS, SCENARIOS } from '@/features/project/mock/scenarios'
import { MediaThumb } from '@/shared/components/media-thumb'
import { Wordmark } from '@/shared/components/logo'
import type { RecentEntry } from '../../../../../shared/contracts'

const FORMATS = [
  { label: '16:9 · Horizontal', w: 64, h: 36 },
  { label: '9:16 · Vertical', w: 28, h: 50 },
  { label: '1:1 · Cuadrado', w: 44, h: 44 }
]

function when(iso: string): string {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  const hm = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  if (days < 1 && d.getDate() === new Date().getDate()) return `Hoy, ${hm}`
  if (days < 2) return 'Ayer'
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function useRecents(): RecentEntry[] | null {
  const [list, setList] = useState<RecentEntry[] | null>(null)
  useEffect(() => {
    const b = bridge()
    if (!b) {
      // Fuera de Electron (pruebas del diseño) se enseña la muestra.
      setList(RECENT_PROJECTS.map((r) => ({ path: r.id, name: r.name, openedAt: new Date().toISOString(), durationLabel: r.duration, resolution: r.resolution, hue: r.hue, exists: true })))
      return
    }
    void b.recentProjects().then(setList)
  }, [])
  return list
}

export function StartScreen() {
  const { openProject, openProjectFile, setDialog } = useEditor.getState()
  const recents = useRecents()

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col gap-1 border-r border-line bg-panel p-4">
        <div className="mb-6 px-2 pt-1">
          <Wordmark />
        </div>
        <button className="btn-primary justify-center" onClick={() => setDialog('new-project')}>
          <Plus className="h-4 w-4" /> Nuevo proyecto
        </button>
        <button className="btn-ghost" onClick={() => void openProjectFile()}>
          <FolderOpen className="h-4 w-4" /> Abrir proyecto…
        </button>
        <button className="btn-ghost" onClick={() => setDialog('agents')}>Integraciones IA</button>
        <div className="mt-auto rounded-lg border border-line bg-base/60 p-3">
          <p className="label mb-2">Proyecto de ejemplo</p>
          <p className="mb-3 text-2xs text-muted">Un montaje de muestra para probar el editor, y cada estado de la interfaz.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {SCENARIOS.map((s) => (
              <button key={s.id} className="btn-ghost h-7 justify-center border border-line text-2xs" onClick={() => openProject(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-10">
        <section className="mb-10 flex items-center justify-between gap-6 rounded-2xl border border-line bg-gradient-to-r from-accent/15 via-panel to-panel p-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Empieza a montar</h1>
            <p className="mt-1 max-w-md text-muted">Arrastra tus clips, córtalos en la línea de tiempo y exporta en el formato que necesites.</p>
          </div>
          <div className="flex gap-3">
            {FORMATS.map((r) => (
              <button
                key={r.label}
                onClick={() => setDialog('new-project')}
                className="flex h-28 w-32 flex-col items-center justify-center gap-3 rounded-xl border border-line bg-base/50 text-2xs text-muted transition-colors hover:border-accent hover:text-ink"
              >
                <span className="rounded border-2 border-current" style={{ width: r.w, height: r.h }} />
                {r.label}
              </button>
            ))}
          </div>
        </section>

        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted" />
          <h2 className="font-semibold">Proyectos recientes</h2>
        </div>
        {recents && recents.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-12 text-center">
            <p className="font-medium">Todavía no hay proyectos recientes</p>
            <p className="text-2xs text-muted">Crea uno nuevo o abre el proyecto de ejemplo para empezar.</p>
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {recents?.map((p) => (
            <button
              key={p.path}
              disabled={p.exists === false}
              onClick={() => (bridge() ? void openProjectFile(p.path) : openProject('normal'))}
              className="group overflow-hidden rounded-xl border border-line bg-panel text-left transition-colors hover:border-accent/70 disabled:opacity-50"
              title={p.path}
            >
              <div className="relative aspect-video">
                <MediaThumb media={{ id: p.path, name: p.name, kind: 'video', duration: null, hue: p.hue, status: 'ready', source: p.thumbPath ? { path: '', playPath: '', hasAudio: false, thumbPath: p.thumbPath } : undefined }} className="h-full w-full" />
                <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-2xs">{p.durationLabel}</span>
                {p.exists === false && (
                  <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 text-2xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-danger" /> Ya no está en su carpeta
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate font-medium group-hover:text-accent">{p.name}</p>
                <p className="mt-0.5 text-2xs text-muted">
                  {when(p.openedAt)} · {p.resolution}
                </p>
              </div>
            </button>
          ))}
        </div>

        <p className="mt-10 flex items-center gap-2 text-2xs text-muted">
          <Sparkles className="h-3.5 w-3.5" /> Tus proyectos se guardan como archivos .wonderfilm; los medios se enlazan, no se copian.
        </p>
      </main>
    </div>
  )
}
