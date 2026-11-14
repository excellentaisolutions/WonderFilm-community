import { AlertTriangle, Link, Loader2, Rewind, Type } from 'lucide-react'
import { memo, type DragEvent, type MouseEvent, type PointerEvent } from 'react'
import { TAG_COLORS } from '@/features/inspector/components/inspector-panel'
import { DND_TRANSITION } from '@/features/library/components/library-panel'
import { clipDuration } from '../model/operations'
import type { Clip, MediaItem } from '../model/types'
import { Waveform } from '@/shared/components/waveform'
import { cx } from '@/shared/lib/seeded'
import { toPx } from './geometry'
import { Filmstrip as RealFilmstrip, RealWaveform } from './clip-content'

interface Props {
  clip: Clip
  media: MediaItem | undefined
  zoom: number
  selected: boolean
  locked: boolean
  razor: boolean
  onPointerDown: (e: PointerEvent, id: string) => void
  onTrimDown: (e: PointerEvent, id: string, edge: 'start' | 'end') => void
  onContextMenu: (e: MouseEvent, id: string) => void
  onDropTransition: (id: string, name: string) => void
}

const SKIN = {
  video: 'bg-clip-video/80 border-clip-video',
  image: 'bg-clip-image/80 border-clip-image',
  audio: 'bg-clip-audio/30 border-clip-audio/80 text-clip-audio',
  text: 'bg-clip-text/75 border-clip-text'
}

function Filmstrip({ hue, height }: { hue: number; height: number }) {
  const tile = Math.round(height * (16 / 9))
  return (
    <div
      className="absolute inset-0 opacity-90"
      style={{
        backgroundImage: `linear-gradient(160deg, hsl(${hue} 70% 62%), hsl(${hue + 25} 55% 40%) 48%, hsl(${hue + 50} 45% 16%)), linear-gradient(90deg, rgb(0 0 0 / .55) 1px, transparent 1px)`,
        backgroundSize: `${tile}px 100%, ${tile}px 100%`,
        backgroundBlendMode: 'normal'
      }}
    />
  )
}

export const ClipView = memo(function ClipView({ clip, media, zoom, selected, locked, razor, onPointerDown, onTrimDown, onContextMenu, onDropTransition }: Props) {
  const kind = media?.kind ?? 'video'
  const width = Math.max(2, toPx(clipDuration(clip), zoom))
  const missing = !media || media.status === 'missing'
  const importing = media?.status === 'importing'
  const narrow = width < 46

  const acceptTransition = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(DND_TRANSITION)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <div
      role="button"
      aria-label={`${media?.name ?? 'Clip'}${selected ? ', seleccionado' : ''}`}
      aria-pressed={selected}
      data-clip-id={clip.id}
      onPointerDown={(e) => !locked && onPointerDown(e, clip.id)}
      onContextMenu={(e) => onContextMenu(e, clip.id)}
      onDragOver={acceptTransition}
      onDrop={(e) => {
        const name = e.dataTransfer.getData(DND_TRANSITION)
        if (name) {
          e.preventDefault()
          e.stopPropagation()
          onDropTransition(clip.id, name)
        }
      }}
      className={cx(
        'group absolute bottom-1 top-1 overflow-hidden rounded-md border text-white',
        SKIN[kind],
        missing && 'stripes-danger border-danger',
        selected ? 'z-10 ring-2 ring-accent ring-offset-1 ring-offset-base' : 'hover:brightness-110',
        razor ? 'cursor-[col-resize]' : locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
      )}
      style={{ left: toPx(clip.start, zoom), width }}
    >
      {!missing && (kind === 'video' || kind === 'image') && (media!.source ? <RealFilmstrip clip={clip} media={media!} width={width} zoom={zoom} /> : <Filmstrip hue={media!.hue} height={54} />)}
      {kind === 'video' && media?.source?.peaksPath && (
        <RealWaveform clip={clip} media={media} width={width} className="absolute inset-x-0 bottom-0 h-3 w-full text-white/70" />
      )}
      {kind === 'audio' &&
        (media?.source ? (
          <RealWaveform clip={clip} media={media} width={width} className="absolute inset-x-0 bottom-1 top-4 h-auto w-full" />
        ) : (
          <Waveform seed={clip.id} bars={Math.max(12, Math.round(width / 5))} className="absolute inset-x-0 bottom-1 top-4 h-auto w-full" />
        ))}
      {clip.effects?.length ? <span className="absolute bottom-1 right-2 rounded bg-black/60 px-1 text-[9px]">fx {clip.effects.length}</span> : null}
      {clip.colorTag && <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: TAG_COLORS[clip.colorTag] }} />}

      {!narrow && (
        <div className="relative flex items-center gap-1 bg-gradient-to-b from-black/55 to-transparent px-1.5 pt-[3px] text-[11px] leading-4">
          {missing && <AlertTriangle className="h-3 w-3 shrink-0 text-danger" />}
          {kind === 'text' && <Type className="h-3 w-3 shrink-0" />}
          {clip.groupId && <Link className="h-3 w-3 shrink-0" />}
          <span className={cx('overflow-hidden text-ellipsis whitespace-nowrap', kind === 'audio' && 'text-ink')}>
            {kind === 'text' ? clip.text : media?.name ?? 'Medio desconocido'}
          </span>
          {clip.speed !== 1 && <span className="ml-auto shrink-0 rounded bg-black/50 px-1 font-mono text-[10px]">{clip.speed}×</span>}
          {clip.reversed && <Rewind className="h-3 w-3 shrink-0" />}
        </div>
      )}

      {importing && (
        <div className="stripes absolute inset-0 flex items-center justify-center bg-black/40 text-[10px]">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          {!narrow && `${Math.round((media!.progress ?? 0) * 100)} %`}
        </div>
      )}

      {!locked && !razor && (
        <>
          <span
            onPointerDown={(e) => onTrimDown(e, clip.id, 'start')}
            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md bg-white/0 group-hover:bg-white/25"
            aria-hidden="true"
          />
          <span
            onPointerDown={(e) => onTrimDown(e, clip.id, 'end')}
            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md bg-white/0 group-hover:bg-white/25"
            aria-hidden="true"
          />
        </>
      )}
    </div>
  )
})
