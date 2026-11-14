import { AlertTriangle, AudioLines, Blend, Clapperboard, Link2, Plus, Search, Sparkles, Trash2, Type, Upload } from 'lucide-react'
import { useState, type DragEvent, type ReactNode } from 'react'
import { useEditor, type LibraryTab } from '@/features/editor/store/editor-store'
import { AUDIO_LIBRARY, TEXT_PRESETS, TRANSITIONS } from '@/features/project/mock/scenarios'
import { EFFECT_INFO, toggleEffect } from '@/features/inspector/effects'
import { formatShort } from '@/features/timeline/model/time'
import type { MediaItem } from '@/features/timeline/model/types'
import { MediaThumb } from '@/shared/components/media-thumb'
import { cx } from '@/shared/lib/seeded'

export const DND_MEDIA = 'application/x-wonderfilm-media'
export const DND_TRANSITION = 'application/x-wonderfilm-transition'

/** Rutas reales de los ficheros soltados desde el explorador. */
export function filePaths(e: DragEvent): string[] {
  const b = window.wonderfilm
  if (!b) return []
  return [...e.dataTransfer.files].map((f) => b.pathForFile(f)).filter(Boolean)
}

const TABS: { id: LibraryTab; label: string; icon: ReactNode }[] = [
  { id: 'media', label: 'Medios', icon: <Clapperboard className="h-[18px] w-[18px]" /> },
  { id: 'audio', label: 'Audio', icon: <AudioLines className="h-[18px] w-[18px]" /> },
  { id: 'text', label: 'Texto', icon: <Type className="h-[18px] w-[18px]" /> },
  { id: 'transitions', label: 'Transiciones', icon: <Blend className="h-[18px] w-[18px]" /> },
  { id: 'effects', label: 'Efectos', icon: <Sparkles className="h-[18px] w-[18px]" /> }
]

const dragMedia = (id: string) => (e: DragEvent) => {
  e.dataTransfer.setData(DND_MEDIA, id)
  e.dataTransfer.effectAllowed = 'copy'
}

export function LibraryPanel() {
  const tab = useEditor((s) => s.libraryTab)
  const setLibraryTab = useEditor((s) => s.setLibraryTab)

  return (
    <aside className="flex min-h-0 w-[340px] shrink-0 border-r border-line bg-panel">
      <nav className="flex w-[60px] shrink-0 flex-col items-center gap-1 border-r border-line py-2" aria-label="Biblioteca">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setLibraryTab(t.id)}
            aria-pressed={tab === t.id}
            className={cx(
              'flex w-[52px] flex-col items-center gap-1 rounded-md py-2 text-[10px] transition-colors',
              tab === t.id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raised hover:text-ink'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        {tab === 'media' && <MediaTab />}
        {tab === 'audio' && <AudioTab />}
        {tab === 'text' && <TextTab />}
        {tab === 'transitions' && <TransitionsTab />}
        {tab === 'effects' && <EffectsTab />}
      </div>
    </aside>
  )
}

function PanelHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between px-3">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {action}
    </div>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative mx-3 mb-2">
      <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted" />
      <input className="field pl-8" placeholder="Buscar" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Buscar" />
    </div>
  )
}

function MediaTab() {
  const media = useEditor((s) => s.media)
  const { importMedia, appendMedia, relinkMedia, removeMedia } = useEditor.getState()
  const [query, setQuery] = useState('')
  const [dropping, setDropping] = useState(false)
  const osDrop = {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setDropping(true)
    },
    onDragLeave: () => setDropping(false),
    onDrop: (e: DragEvent) => {
      setDropping(false)
      const paths = filePaths(e)
      if (!paths.length) return
      e.preventDefault()
      void importMedia(paths)
    }
  }
  const visible = media.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <>
      <PanelHeader
        title="Medios del proyecto"
        action={
          <button className="btn-ghost h-7 border border-line px-2 text-2xs" onClick={() => void importMedia()}>
            <Upload className="h-3.5 w-3.5" /> Importar
          </button>
        }
      />
      {media.length === 0 ? (
        <button
          {...osDrop}
          onClick={() => void importMedia()}
          className={cx(dropping && 'border-accent text-ink', "m-3 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line text-center text-muted transition-colors hover:border-accent hover:text-ink")}
        >
          <Upload className="h-8 w-8" />
          <span className="font-medium text-ink">Importa tus vídeos, fotos y audio</span>
          <span className="max-w-[200px] text-2xs">Pulsa aquí o arrastra archivos desde el explorador.</span>
        </button>
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} />
          <div {...osDrop} className={cx('grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto px-3 pb-3', dropping && 'bg-accent/5 outline-dashed outline-2 -outline-offset-4 outline-accent/60')}>
            {visible.map((m) => (
              <MediaCard key={m.id} media={m} onAppend={() => appendMedia(m.id)} onRelink={() => relinkMedia(m.id)} onRemove={() => removeMedia(m.id)} />
            ))}
            {visible.length === 0 && <p className="col-span-2 py-8 text-center text-2xs text-muted">Nada coincide con «{query}».</p>}
          </div>
        </>
      )}
    </>
  )
}

function MediaCard({ media, onAppend, onRelink, onRemove }: { media: MediaItem; onAppend: () => void; onRelink: () => void; onRemove: () => void }) {
  const ready = media.status === 'ready'
  return (
    <div
      draggable={ready}
      onDragStart={dragMedia(media.id)}
      onDoubleClick={() => ready && onAppend()}
      className={cx('group relative overflow-hidden rounded-lg border bg-base', media.status === 'missing' ? 'border-danger/60' : 'border-line hover:border-accent/60', ready && 'cursor-grab')}
      title={ready ? 'Arrastra a la línea de tiempo o haz doble clic para añadir al final' : undefined}
    >
      <div className="relative aspect-video">
        <MediaThumb media={media} className={cx('h-full w-full', !ready && 'opacity-40')} />
        {media.source?.proxy && ready && (
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] font-semibold tracking-wide text-accent" title="Se reproduce con una copia ligera; al exportar se usa el original">
            PROXY
          </span>
        )}
        {media.duration !== null && ready && (
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[10px]">{formatShort(media.duration)}</span>
        )}
        {media.status === 'importing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/40 px-3">
            <span className="whitespace-nowrap text-[10px]">Importando · {Math.round((media.progress ?? 0) * 100)} %</span>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${(media.progress ?? 0) * 100}%` }} />
            </div>
          </div>
        )}
        {media.status === 'missing' && (
          <div className="stripes-danger absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <button className="rounded bg-black/70 px-2 py-0.5 text-[10px] hover:bg-black" onClick={onRelink}>
              <Link2 className="mr-1 inline h-3 w-3" />
              Volver a vincular
            </button>
          </div>
        )}
        {ready && (
          <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
            <button className="rounded bg-black/70 p-1 hover:bg-accent hover:text-base" onClick={onAppend} aria-label="Añadir al final" title="Añadir al final">
              <Plus className="h-3 w-3" />
            </button>
            <button className="rounded bg-black/70 p-1 hover:bg-danger" onClick={onRemove} aria-label="Quitar del proyecto" title="Quitar del proyecto">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      <p className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-1.5 text-2xs">{media.name}</p>
      {media.status === 'missing' && <p className="-mt-1 whitespace-nowrap px-2 pb-1.5 text-[10px] text-danger">No encontrado</p>}
    </div>
  )
}

function AudioTab() {
  const [query, setQuery] = useState('')
  const appendMedia = useEditor((s) => s.appendMedia)
  const visible = AUDIO_LIBRARY.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
  return (
    <>
      <PanelHeader title="Música y efectos de sonido" />
      <SearchBox value={query} onChange={setQuery} />
      <ul className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {visible.map((a) => (
          <li
            key={a.id}
            draggable
            onDragStart={dragMedia(a.id)}
            onDoubleClick={() => appendMedia(a.id)}
            className="flex cursor-grab items-center gap-3 rounded-lg border border-transparent p-2 hover:border-line hover:bg-raised"
          >
            <MediaThumb media={a} className="h-10 w-10 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">{a.name}</p>
              <p className="text-2xs text-muted">{a.sizeLabel}</p>
            </div>
            <button className="btn-icon" onClick={() => appendMedia(a.id)} aria-label={`Añadir ${a.name}`}>
              <Plus className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function TextTab() {
  const appendMedia = useEditor((s) => s.appendMedia)
  return (
    <>
      <PanelHeader title="Títulos y rótulos" />
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto px-3 pb-3">
        {TEXT_PRESETS.map((t, i) => (
          <button
            key={t.id}
            draggable
            onDragStart={dragMedia(t.id)}
            onDoubleClick={() => appendMedia(t.id)}
            className="cursor-grab overflow-hidden rounded-lg border border-line bg-base text-left hover:border-accent/60"
          >
            <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-clip-text/40 to-base p-2">
              <span className={cx('text-center leading-tight', ['text-lg font-bold', 'self-end text-2xs font-semibold', 'text-[11px] tracking-[0.3em]', 'self-end text-2xs'][i])}>
                {['Título', 'Nombre · Cargo', 'CRÉDITOS', 'Subtítulo de ejemplo'][i]}
              </span>
            </div>
            <p className="px-2 py-1.5 text-2xs">{t.name}</p>
          </button>
        ))}
      </div>
    </>
  )
}

function TransitionsTab() {
  const selection = useEditor((s) => s.selection)
  const setTransition = useEditor((s) => s.setTransition)
  const showToast = useEditor((s) => s.showToast)
  return (
    <>
      <PanelHeader title="Transiciones" />
      <p className="mx-3 mb-2 text-2xs text-muted">Arrastra una transición al final de un clip, o selecciona el clip y haz clic.</p>
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto px-3 pb-3">
        {TRANSITIONS.map((name, i) => (
          <button
            key={name}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND_TRANSITION, name)}
            onClick={() => (selection[0] ? setTransition(selection[0], name) : showToast('Selecciona primero un clip en la línea de tiempo'))}
            className="overflow-hidden rounded-lg border border-line bg-base text-left hover:border-accent/60"
          >
            <div className="relative aspect-video overflow-hidden">
              <div className="absolute inset-0" style={{ background: `hsl(${200 + i * 20} 45% 35%)` }} />
              <div
                className="absolute inset-0"
                style={{ background: `hsl(${20 + i * 25} 60% 50%)`, clipPath: ['inset(0 0 0 50%)', 'circle(35% at 50% 50%)', 'polygon(40% 0, 100% 0, 100% 100%, 60% 100%)', 'inset(25%)', 'inset(50% 0 0 0)', 'inset(0 0 0 50%)'][i], filter: i === 5 ? 'blur(6px)' : undefined, opacity: i === 0 ? 0.6 : 1 }}
              />
            </div>
            <p className="px-2 py-1.5 text-2xs">{name}</p>
          </button>
        ))}
      </div>
    </>
  )
}

function EffectsTab() {
  const showToast = useEditor((s) => s.showToast)
  const selection = useEditor((s) => s.selection)
  const groups = [...new Set(EFFECT_INFO.map((e) => e.group))]
  const apply = (id: (typeof EFFECT_INFO)[number]['id'], label: string) => {
    const { sequence, updateClip, media } = useEditor.getState()
    const targets = sequence.clips.filter((c) => selection.includes(c.id) && media.find((m) => m.id === c.mediaId)?.kind !== 'audio')
    if (!targets.length) return showToast('Selecciona primero un clip de vídeo o imagen')
    for (const c of targets) updateClip(c.id, { effects: toggleEffect(c.effects, id) })
    showToast(`«${label}» aplicado a ${targets.length} ${targets.length === 1 ? 'clip' : 'clips'}`)
  }
  return (
    <>
      <PanelHeader title="Efectos" />
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((g) => (
          <section key={g} className="mb-3">
            <h3 className="label mb-1.5">{g}</h3>
            <div className="grid grid-cols-2 gap-2">
              {EFFECT_INFO.filter((e) => e.group === g).map((e) => (
                <button
                  key={e.id}
                  onClick={() => apply(e.id, e.label)}
                  className="flex items-center gap-2 rounded-lg border border-line bg-base p-2 text-left text-2xs hover:border-accent/60"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
                  {e.label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
