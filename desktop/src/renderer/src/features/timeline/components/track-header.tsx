import { Eye, EyeOff, Film, Lock, LockOpen, Magnet, Music, Volume2, VolumeX } from 'lucide-react'
import type { Track } from '../model/types'
import { cx } from '@/shared/lib/seeded'
import { HEADER_WIDTH, trackHeight } from './geometry'

interface Props {
  track: Track
  isMain: boolean
  magnetic: boolean
  selected: boolean
  onSelect: () => void
  onToggle: (patch: Partial<Track>) => void
}

export function TrackHeader({ track, isMain, magnetic, selected, onSelect, onToggle }: Props) {
  const visual = track.kind === 'visual'
  const off = visual ? track.hidden : track.muted
  return (
    <div
      onClick={onSelect}
      className={cx(
        'sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-b border-r border-line px-2',
        selected ? 'bg-raised' : 'bg-panel hover:bg-raised/60'
      )}
      style={{ width: HEADER_WIDTH, height: trackHeight(track.kind) }}
    >
      {visual ? <Film className="h-3.5 w-3.5 shrink-0 text-clip-video" /> : <Music className="h-3.5 w-3.5 shrink-0 text-clip-audio" />}
      <div className="min-w-0 flex-1">
        <p className={cx('overflow-hidden text-ellipsis whitespace-nowrap text-2xs font-medium', off && 'text-muted')}>{track.name}</p>
        {isMain && (
          <p className="flex items-center gap-0.5 text-[10px] text-muted" title={magnetic ? 'Pista principal: sin huecos' : 'Pista principal'}>
            {magnetic && <Magnet className="h-2.5 w-2.5 text-accent" />} Principal
          </p>
        )}
      </div>
      <button
        className="btn-icon h-6 w-6"
        aria-pressed={track.locked}
        aria-label={track.locked ? 'Desbloquear pista' : 'Bloquear pista'}
        title={track.locked ? 'Desbloquear pista' : 'Bloquear pista'}
        onClick={(e) => {
          e.stopPropagation()
          onToggle({ locked: !track.locked })
        }}
      >
        {track.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
      </button>
      <button
        className="btn-icon h-6 w-6"
        aria-pressed={off}
        aria-label={visual ? (off ? 'Mostrar pista' : 'Ocultar pista') : off ? 'Activar sonido' : 'Silenciar pista'}
        title={visual ? (off ? 'Mostrar pista' : 'Ocultar pista') : off ? 'Activar sonido' : 'Silenciar pista'}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(visual ? { hidden: !track.hidden } : { muted: !track.muted })
        }}
      >
        {visual ? off ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" /> : off ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
