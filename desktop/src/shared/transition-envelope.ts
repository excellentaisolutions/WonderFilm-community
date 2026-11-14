import { clipDuration, clipEnd, nextContiguous } from '../renderer/src/features/timeline/model/operations'
import type { Clip, Sequence } from '../renderer/src/features/timeline/model/types'

export function transitionTiming(seq: Sequence, clip: Clip) {
  const previous = seq.clips.find(c => c.id !== clip.id && c.trackId === clip.trackId && clipEnd(c) === clip.start && c.transitionOut)
  const next = nextContiguous(seq, clip)
  const incoming = previous?.transitionOut && previous.transitionOut.name !== 'Fundido a negro' ? Math.min(previous.transitionOut.duration / 2, clipDuration(previous) / 2, clipDuration(clip) / 2) : 0
  const outgoing = clip.transitionOut && clip.transitionOut.name !== 'Fundido a negro' && next ? Math.min(clip.transitionOut.duration / 2, clipDuration(clip) / 2, clipDuration(next) / 2) : 0
  return { incoming, outgoing, name: previous?.transitionOut?.name, start: clip.start - incoming, end: clipEnd(clip) + outgoing }
}

export function transitionEnvelope(seq: Sequence, clip: Clip, at: number): number {
  const duration = clipDuration(clip)
  let alpha = 1
  const timing = transitionTiming(seq, clip)
  if (timing.incoming && !['Barrido lateral', 'Deslizar arriba'].includes(timing.name ?? '')) alpha = Math.min(alpha, (at - timing.start) / (2 * timing.incoming))
  if (clip.transitionOut?.name === 'Fundido a negro' && nextContiguous(seq, clip)) {
    const half = Math.min(clip.transitionOut.duration / 2, duration / 2)
    if (half > 0) alpha = Math.min(alpha, (clipEnd(clip) - at) / half)
  }
  const previous = seq.clips.find(c => c.id !== clip.id && c.trackId === clip.trackId && clipEnd(c) === clip.start && c.transitionOut)
  if (previous?.transitionOut?.name === 'Fundido a negro') {
    const half = Math.min(previous.transitionOut.duration / 2, duration / 2)
    if (half > 0) alpha = Math.min(alpha, (at - clip.start) / half)
  }
  return Math.max(0, Math.min(1, alpha))
}
