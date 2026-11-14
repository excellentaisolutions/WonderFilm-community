import { memo } from 'react'
import { formatShort } from '../model/time'
import { SECOND } from '../model/types'
import { RULER_HEIGHT, rulerStep } from './geometry'

interface Props {
  zoom: number
  width: number
  scrollLeft: number
  viewWidth: number
}

/** Solo se pintan las marcas del tramo visible. */
export const Ruler = memo(function Ruler({ zoom, width, scrollLeft, viewWidth }: Props) {
  const step = rulerStep(zoom)
  const minor = step / 5
  const from = Math.max(0, Math.floor(scrollLeft / zoom / step) * step)
  const to = (scrollLeft + viewWidth) / zoom + step
  const marks: { t: number; major: boolean }[] = []
  for (let t = from; t <= to; t = +(t + minor).toFixed(4)) {
    marks.push({ t, major: Math.abs(t / step - Math.round(t / step)) < 1e-6 })
  }

  return (
    <div className="relative" style={{ width, height: RULER_HEIGHT }}>
      {marks.map(({ t, major }) => (
        <div key={t} className="absolute bottom-0" style={{ left: t * zoom }}>
          <div className={major ? 'h-2.5 w-px bg-muted' : 'h-1.5 w-px bg-line'} />
          {major && (
            <span className="absolute -top-[15px] left-1 whitespace-nowrap font-mono text-[10px] text-muted">
              {step < 1 ? `${formatShort(t * SECOND)}.${String(Math.round((t % 1) * 100)).padStart(2, '0')}` : formatShort(t * SECOND)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
})
