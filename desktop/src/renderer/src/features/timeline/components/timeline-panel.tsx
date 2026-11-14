import { Blend, Clapperboard } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { findMedia, useEditor, useVisibleSequence } from '@/features/editor/store/editor-store'
import { DND_MEDIA, filePaths } from '@/features/library/components/library-panel'
import { useClipDrag, startScrub } from '../hooks/use-clip-drag'
import { clipEnd, mainTrackId, nextContiguous, sequenceDuration } from '../model/operations'
import { SECOND, type Track } from '../model/types'
import { ClipMenu, type MenuState } from './clip-menu'
import { ClipView } from './clip-view'
import { HEADER_WIDTH, RULER_HEIGHT, TAIL_SECONDS, toPx, toTime, trackHeight } from './geometry'
import { Ruler } from './ruler'
import { TimelineToolbar } from './timeline-toolbar'
import { TrackHeader } from './track-header'
import { cx } from '@/shared/lib/seeded'

export function TimelinePanel() {
  const seq = useVisibleSequence()
  const media = useEditor((s) => s.media)
  const zoom = useEditor((s) => s.zoom)
  const playhead = useEditor((s) => s.playhead)
  const playing = useEditor((s) => s.playing)
  const selection = useEditor((s) => s.selection)
  const selectedTrackId = useEditor((s) => s.selectedTrackId)
  const tool = useEditor((s) => s.tool)
  const magnetic = useEditor((s) => s.magnetic)
  const snapGuide = useEditor((s) => s.snapGuide)
  const { select, selectTrack, updateTrack, addMedia, setTransition, setZoom } = useEditor.getState()
  const { onClipPointerDown, onTrimPointerDown } = useClipDrag()

  const scrollRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ left: 0, width: 1000 })
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const duration = sequenceDuration(seq)
  const contentWidth = Math.max(toPx(duration + TAIL_SECONDS * SECOND, zoom), view.width - HEADER_WIDTH)
  const main = mainTrackId(seq)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setView({ left: el.scrollLeft, width: el.clientWidth })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Ctrl+rueda: zoom anclado al punto bajo el cursor. Necesita un listener no pasivo.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const { zoom: z, setZoom: apply } = useEditor.getState()
      const x = e.clientX - el.getBoundingClientRect().left - HEADER_WIDTH
      const t = (el.scrollLeft + x) / z
      apply(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
      el.scrollLeft = t * useEditor.getState().zoom - x
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Durante la reproducción, la vista sigue al cabezal.
  useEffect(() => {
    const el = scrollRef.current
    if (!playing || !el) return
    const x = toPx(playhead, zoom)
    const visible = el.clientWidth - HEADER_WIDTH
    if (x < el.scrollLeft || x > el.scrollLeft + visible - 40) el.scrollLeft = x - 80
  }, [playhead, playing, zoom])

  const fit = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const seconds = sequenceDuration(useEditor.getState().sequence) / SECOND
    setZoom(seconds > 0 ? (el.clientWidth - HEADER_WIDTH - 60) / seconds : 28)
    el.scrollLeft = 0
  }, [setZoom])

  useEffect(() => {
    const onFit = () => fit()
    window.addEventListener('wonderfilm:fit', onFit)
    return () => window.removeEventListener('wonderfilm:fit', onFit)
  }, [fit])

  const onContextMenu = useCallback((e: MouseEvent, id: string) => {
    e.preventDefault()
    const { selection: current, select: pick } = useEditor.getState()
    if (!current.includes(id)) pick([id])
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const onDropTransition = useCallback((id: string, name: string) => setTransition(id, name), [setTransition])

  const dropOn = (trackId: string | null) => (e: DragEvent<HTMLDivElement>) => {
    const id = e.dataTransfer.getData(DND_MEDIA)
    setDropTarget(null)
    const at = toTime(e.clientX - e.currentTarget.getBoundingClientRect().left, zoom)
    if (id) {
      e.preventDefault()
      return addMedia(id, trackId, at)
    }
    // Ficheros desde el explorador: se importan y se colocan donde se soltaron.
    const paths = filePaths(e)
    if (!paths.length) return
    e.preventDefault()
    void useEditor.getState().importMedia(paths, { trackId, at })
  }

  const allowDrop = (key: string) => (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DND_MEDIA) && !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (dropTarget !== key) setDropTarget(key)
  }

  const lane = (track: Track) => {
    const clips = seq.clips.filter((c) => c.trackId === track.id)
    return (
      <div
        data-track-id={track.id}
        onDragOver={allowDrop(track.id)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={dropOn(track.id)}
        onPointerDown={(e) => e.button === 0 && !e.ctrlKey && select([])}
        className={cx(
          'relative border-b border-line/70',
          track.kind === 'audio' ? 'bg-base/60' : 'bg-base',
          (track.hidden || track.muted) && 'opacity-45',
          dropTarget === track.id && 'bg-accent/10',
          selectedTrackId === track.id && 'bg-raised/40'
        )}
        style={{ width: contentWidth, height: trackHeight(track.kind) }}
      >
        {track.locked && <div className="stripes pointer-events-none absolute inset-0 z-20" title="Pista bloqueada" />}
        {clips.map((clip) => (
          <ClipView
            key={clip.id}
            clip={clip}
            media={findMedia(media, clip.mediaId)}
            zoom={zoom}
            selected={selection.includes(clip.id)}
            locked={track.locked}
            razor={tool === 'razor'}
            onPointerDown={onClipPointerDown}
            onTrimDown={onTrimPointerDown}
            onContextMenu={onContextMenu}
            onDropTransition={onDropTransition}
          />
        ))}
        {clips
          .filter((c) => c.transitionOut && nextContiguous(seq, c))
          .map((c) => (
            <div
              key={`tr-${c.id}`}
              className="pointer-events-none absolute top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded bg-ink text-base shadow"
              style={{ left: toPx(clipEnd(c), zoom) }}
              title={c.transitionOut!.name}
            >
              <Blend className="h-3 w-3" />
            </div>
          ))}
      </div>
    )
  }

  return (
    <section className="flex h-[40%] min-h-[260px] shrink-0 flex-col border-t border-line bg-panel">
      <TimelineToolbar onFit={fit} />
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" onScroll={(e) => setView({ left: e.currentTarget.scrollLeft, width: e.currentTarget.clientWidth })}>
        <div className="relative min-h-full" style={{ width: HEADER_WIDTH + contentWidth }}>
          <div className="sticky top-0 z-30 flex border-b border-line bg-panel" style={{ height: RULER_HEIGHT }}>
            <div className="sticky left-0 z-40 shrink-0 border-r border-line bg-panel" style={{ width: HEADER_WIDTH }} />
            <div
              ref={rulerRef}
              className="relative cursor-pointer"
              onPointerDown={(e) => startScrub(e, () => rulerRef.current?.getBoundingClientRect().left ?? 0)}
            >
              <Ruler zoom={zoom} width={contentWidth} scrollLeft={view.left} viewWidth={view.width} />
              <div className="pointer-events-none absolute bottom-0 -translate-x-1/2" style={{ left: toPx(playhead, zoom) }}>
                <div className="h-3.5 w-3 rounded-b-sm bg-accent [clip-path:polygon(0_0,100%_0,100%_60%,50%_100%,0_60%)]" />
              </div>
            </div>
          </div>

          {seq.tracks.map((track) => (
            <div key={track.id} className="flex">
              <TrackHeader
                track={track}
                isMain={track.id === main}
                magnetic={magnetic}
                selected={selectedTrackId === track.id}
                onSelect={() => selectTrack(selectedTrackId === track.id ? null : track.id)}
                onToggle={(patch) => updateTrack(track.id, patch)}
              />
              {lane(track)}
            </div>
          ))}

          <div className="flex">
            <div className="sticky left-0 z-20 shrink-0 border-r border-line bg-panel" style={{ width: HEADER_WIDTH, height: 44 }} />
            <div
              onDragOver={allowDrop('new')}
              onDragLeave={() => setDropTarget(null)}
              onDrop={dropOn(null)}
              className={cx('flex items-center px-4 text-2xs', dropTarget === 'new' ? 'bg-accent/10 text-accent' : 'text-muted/60')}
              style={{ width: contentWidth, height: 44 }}
            >
              {dropTarget === 'new' ? 'Suelta para crear una pista nueva' : ''}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-0 top-0 z-[15] w-px bg-accent" style={{ left: HEADER_WIDTH + toPx(playhead, zoom) }} />
          {snapGuide !== null && (
            <div className="pointer-events-none absolute bottom-0 z-[16] w-px bg-ink/80" style={{ top: RULER_HEIGHT, left: HEADER_WIDTH + toPx(snapGuide, zoom) }} />
          )}

          {seq.clips.length === 0 && (
            <div className="pointer-events-none absolute flex flex-col items-center justify-center gap-2 text-center" style={{ left: HEADER_WIDTH, top: RULER_HEIGHT, width: Math.min(contentWidth, view.width - HEADER_WIDTH), bottom: 44 }}>
              <Clapperboard className="h-7 w-7 text-muted" />
              <p className="font-medium">Tu línea de tiempo está vacía</p>
              <p className="text-2xs text-muted">Arrastra aquí vídeos, fotos o audio desde la biblioteca para empezar a montar.</p>
            </div>
          )}
        </div>
      </div>
      {menu && <ClipMenu menu={menu} onClose={() => setMenu(null)} />}
    </section>
  )
}
