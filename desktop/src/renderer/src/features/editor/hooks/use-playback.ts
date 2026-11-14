import { useEffect } from 'react'
import { sequenceDuration } from '@/features/timeline/model/operations'
import { SECOND } from '@/features/timeline/model/types'
import { useEditor } from '../store/editor-store'
import { playbackTime } from '../../preview/playback-clock'

/** Reproducción ligada al reloj audiovisual; reloj de pared para huecos. */
export function usePlayback() {
  const playing = useEditor((s) => s.playing)

  useEffect(() => {
    if (!playing) return
    const { sequence, playhead } = useEditor.getState()
    const end = sequenceDuration(sequence)
    if (playhead >= end) useEditor.setState({ playhead: 0 })
    let last = performance.now()
    let raf = requestAnimationFrame(function step(now) {
      const { playhead: t } = useEditor.getState()
      const mediaTime = playbackTime(t)
      const next = mediaTime === undefined ? t + (now - last) * (SECOND / 1000) : Math.max(t, mediaTime)
      last = now
      if (next >= end) {
        useEditor.setState({ playhead: end, playing: false })
        return
      }
      useEditor.setState({ playhead: next })
      raf = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(raf)
  }, [playing])
}
