import { useEffect, useState } from 'react'
import { bridge, useEditor } from '../editor/store/editor-store'
import { SECOND, type Clip, type MediaItem } from '../timeline/model/types'

export function usePlayableClip(clip: Clip, media: MediaItem) {
  const source = media.source!.playPath
  const key = JSON.stringify([source, clip.sourceIn, clip.sourceOut])
  const [prepared, setPrepared] = useState<{ key: string; path?: string; error?: string }>()
  useEffect(() => {
    if (!clip.reversed) return
    let disposed = false
    const state = useEditor.getState()
    if (state.playhead >= clip.start && state.playhead < clip.start + (clip.sourceOut - clip.sourceIn) / clip.speed) state.setPlaying(false)
    void bridge()?.reversePreview(source, clip.sourceIn / SECOND, clip.sourceOut / SECOND).then(result => {
      if (!disposed) setPrepared({ key, ...result })
    }).catch(error => { if (!disposed) setPrepared({ key, error: String(error) }) })
    return () => { disposed = true }
  }, [source, key, clip.reversed, clip.sourceIn, clip.sourceOut])
  if (!clip.reversed) return { clip, path: source }
  if (prepared?.key !== key) return { clip, path: undefined }
  return { clip: { ...clip, sourceIn: 0, sourceOut: clip.sourceOut - clip.sourceIn }, path: prepared.path, error: prepared.error }
}
