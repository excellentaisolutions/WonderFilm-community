import { AudioLines, Image as ImageIcon, Type } from 'lucide-react'
import type { MediaItem } from '@/features/timeline/model/types'
import { cx } from '@/shared/lib/seeded'
import { mediaUrl } from '../../../../shared/contracts'
import { Waveform } from './waveform'

/** Miniatura de muestra: en la Fase 1 no se decodifican medios reales. */
export function MediaThumb({ media, className }: { media: MediaItem; className?: string }) {
  const h = media.hue
  const thumb = media.source?.thumbPath
  if (thumb && media.kind !== 'audio') {
    return (
      <div className={cx('relative overflow-hidden bg-black', className)}>
        <img src={mediaUrl(thumb)} alt="" draggable={false} className="h-full w-full object-cover" />
        {media.kind === 'image' && <ImageIcon className="absolute bottom-1 right-1 h-3.5 w-3.5 text-white/80 drop-shadow" />}
      </div>
    )
  }
  if (media.kind === 'audio') {
    return (
      <div className={cx('relative flex items-center justify-center overflow-hidden bg-clip-audio/25 text-clip-audio', className)}>
        <Waveform seed={media.id} className="absolute inset-x-1 inset-y-3 h-auto w-auto opacity-70" />
        <AudioLines className="relative h-5 w-5" />
      </div>
    )
  }
  if (media.kind === 'text') {
    return (
      <div className={cx('flex items-center justify-center bg-gradient-to-br from-clip-text/50 to-clip-text/10', className)}>
        <Type className="h-6 w-6 text-ink/90" />
      </div>
    )
  }
  return (
    <div
      className={cx('relative overflow-hidden', className)}
      style={{ background: `linear-gradient(160deg, hsl(${h} 70% 62%) 0%, hsl(${h + 25} 55% 40%) 48%, hsl(${h + 50} 45% 16%) 100%)` }}
    >
      <div className="absolute inset-x-0 bottom-0 h-2/5" style={{ background: `linear-gradient(0deg, hsl(${h + 60} 35% 10% / .85), transparent)` }} />
      <div className="absolute left-[18%] top-[22%] h-[22%] aspect-square rounded-full" style={{ background: `hsl(${h + 10} 90% 85% / .75)` }} />
      {media.kind === 'image' && <ImageIcon className="absolute bottom-1 right-1 h-3.5 w-3.5 text-white/70" />}
    </div>
  )
}
