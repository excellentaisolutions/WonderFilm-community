import { agentSchemas as schemas, type AgentCommand } from '../../../../shared/agent-schema'
import { useEditor, usedAndOwnMedia, findMedia } from '../editor/store/editor-store'
import * as ops from '../timeline/model/operations'
import { SECOND, type MediaItem, type Clip } from '../timeline/model/types'
import { snapToFrame } from '../timeline/model/time'
import { useProjectDecision } from '../project/store/project-decision'

const state = () => useEditor.getState()
const micros = (seconds: number) => snapToFrame(seconds * SECOND, state().sequence.fps)
export function projectState() {
  const s = state()
  return { name: s.projectName, path: s.projectPath, dirty: s.dirty, screen: s.screen, timeUnit: 'microseconds', media: usedAndOwnMedia(s.media, s.sequence), sequence: s.sequence,
    magnetic: s.magnetic, snapping: s.snapping, playhead: s.playhead, playing: s.playing, canUndo: s.past.length > 0, canRedo: s.future.length > 0 }
}
function track(id: string, editable = true) {
  const t = state().sequence.tracks.find(t => t.id === id)
  if (!t) throw new Error('Pista no encontrada')
  if (editable && t.locked) throw new Error('La pista está bloqueada')
  return t
}
function clip(id: string) { const c = state().sequence.clips.find(c => c.id === id); if (!c) throw new Error('Clip no encontrado'); track(c.trackId); return c }
function safeReplace(discard: boolean) { if (state().dirty && !discard) throw new Error('Hay cambios sin guardar. Guarda el proyecto o indica discardChanges explícitamente') }
function apply(seq: typeof state extends () => infer S ? S extends { sequence: infer Q } ? Q : never : never) { state().commit(seq) }

async function importPaths(paths: string[]) {
  const b = window.wonderfilm!
  const ids = new Set<string>()
  let finish: (() => void) | undefined
  let rejectImport: ((error: Error) => void) | undefined
  const ready = new Promise<void>((resolve, reject) => { finish = resolve; rejectImport = reject })
  const unsubscribe = b.onMediaEvent(event => {
    if (event.type === 'failed') return rejectImport?.(new Error(`${event.name}: ${event.message}`))
    if (event.type === 'added') ids.add(event.item.id)
    if (ids.size === paths.length && [...ids].every(id => state().media.find(m => m.id === id)?.status === 'ready')) finish?.()
  })
  const timeout = window.setTimeout(() => rejectImport?.(new Error('La importación sigue pendiente; consulta project.get antes de reintentar')), 600000)
  try { await state().importMedia(paths); await ready; return state().media.filter(m => ids.has(m.id)) } finally { unsubscribe(); clearTimeout(timeout) }
}

export async function executeAgent({ method, params }: AgentCommand): Promise<unknown> {
  const s = state(), b = window.wonderfilm!
  if (method === 'project.get') return projectState()
  if (useProjectDecision.getState().pending) throw new Error('Resuelve el aviso de cambios pendientes antes de continuar')
  if (s.dialog && s.dialog !== 'agents') throw new Error('Cierra el diálogo abierto antes de editar con un agente')
  if (method !== 'playback.set') s.setPlaying(false)
  switch (method) {
    case 'project.create': { const p = schemas[method].parse(params); safeReplace(p.discardChanges); s.createProject(p, p.discardChanges); return projectState() }
    case 'project.open': {
      const p = schemas[method].parse(params); safeReplace(p.discardChanges)
      const result = await b.openProject(p.path); if (!result || 'error' in result) throw new Error(result && 'error' in result ? result.error : 'No se abrió el proyecto')
      useEditor.setState({ sessionId: state().sessionId + 1, screen: 'editor', scenario: null, projectName: result.doc.name, projectPath: result.path, media: result.doc.media, sequence: result.doc.sequence, dirty: false, past: [], future: [], preview: null, selection: [], playhead: 0, savedAt: Date.now() }); await b.setDirty(false); return projectState()
    }
    case 'project.save': {
      const p = schemas[method].parse(params), target = await b.saveProject({ name: s.projectName, sequence: s.sequence, media: usedAndOwnMedia(s.media, s.sequence) }, p.path, false)
      if (!target) throw new Error('No se guardó el proyecto')
      useEditor.setState({ projectPath: target, dirty: false, savedAt: Date.now(), scenario: null }); return { path: target }
    }
    case 'project.configure': {
      const p = schemas[method].parse(params)
      if (p.name) s.setProjectName(p.name)
      if (p.magnetic !== undefined && p.magnetic !== s.magnetic) s.toggleMagnetic()
      if (p.snapping !== undefined && p.snapping !== state().snapping) s.toggleSnapping()
      const patch = { ...(p.width ? { width: p.width } : {}), ...(p.height ? { height: p.height } : {}), ...(p.fps ? { fps: p.fps } : {}) }; if (Object.keys(patch).length) state().updateSequence(patch)
      break
    }
    case 'media.import': { const p = schemas[method].parse(params); if (new Set(p.paths).size !== p.paths.length) throw new Error('Rutas duplicadas'); return importPaths(p.paths) }
    case 'media.remove': { const p = schemas[method].parse(params); if (!s.media.some(m => m.id === p.mediaId)) throw new Error('Medio no encontrado'); if (s.sequence.clips.some(c => c.mediaId === p.mediaId)) throw new Error('El medio está en uso'); s.removeMedia(p.mediaId); break }
    case 'track.add': { const p = schemas[method].parse(params), added = ops.addTrack(s.sequence, p.kind); apply(p.name ? ops.updateTrack(added.seq, added.trackId, { name: p.name }) : added.seq); return { trackId: added.trackId, project: projectState() } }
    case 'track.update': { const { trackId, ...patch } = schemas[method].parse(params); track(trackId, false); s.updateTrack(trackId, patch); break }
    case 'clip.add': {
      const p = schemas[method].parse(params), t = track(p.trackId), m = findMedia(s.media, p.mediaId)
      if (!m || m.status !== 'ready' || (m.kind !== 'text' && !m.source)) throw new Error('Medio real no disponible o aún importándose')
      if (ops.trackKindFor(m.kind) !== t.kind) throw new Error('Tipo de medio incompatible con la pista')
      const from = micros(p.sourceIn), duration = p.duration !== undefined ? micros(p.duration) : m.duration !== null ? m.duration - from : 5 * SECOND
      if (duration <= 0 || (m.duration !== null && from + duration > m.duration)) throw new Error('Recorte fuera de la duración de la fuente')
      const c = { ...ops.createClip(m, t.id, micros(p.at)), sourceIn: from, sourceOut: from + duration }
      apply(ops.placeClips({ ...s.sequence, clips: [...s.sequence.clips, c] }, [c.id], s.magnetic)); return { clipId: c.id, project: projectState() }
    }
    case 'title.add': {
      const p = schemas[method].parse(params); if (track(p.trackId).kind !== 'visual') throw new Error('Los títulos requieren pista visual')
      const m: MediaItem = { id: crypto.randomUUID(), name: p.text, kind: 'text', duration: null, hue: 40, status: 'ready' }
      const c = { ...ops.createClip(m, p.trackId, micros(p.at)), sourceOut: micros(p.duration), textColor: p.color }
      useEditor.setState({ media: [...s.media, m] }); apply(ops.placeClips({ ...s.sequence, clips: [...s.sequence.clips, c] }, [c.id], s.magnetic)); return { clipId: c.id, project: projectState() }
    }
    case 'clip.update': {
      const { clipId, fadeIn, fadeOut, transform, ...patch } = schemas[method].parse(params), c = clip(clipId)
      if ((patch.text !== undefined || patch.textColor !== undefined) && findMedia(s.media, c.mediaId)?.kind !== 'text') throw new Error('El texto requiere un título')
      const update: Partial<Clip> = { ...patch, ...(transform ? { transform: { ...c.transform, ...transform } } : {}), ...(fadeIn !== undefined ? { fadeIn: micros(fadeIn) } : {}), ...(fadeOut !== undefined ? { fadeOut: micros(fadeOut) } : {}) }
      if ((update.fadeIn ?? 0) > ops.clipDuration(c) || (update.fadeOut ?? 0) > ops.clipDuration(c)) throw new Error('El fundido supera la duración del clip')
      s.updateClip(clipId, update); break
    }
    case 'clip.move': { const p = schemas[method].parse(params), c = clip(p.clipId), t = track(p.trackId); if (track(c.trackId).kind !== t.kind) throw new Error('Pista incompatible'); apply(ops.moveClips(s.sequence, [c.id], micros(p.at) - c.start, s.sequence.tracks.indexOf(t) - s.sequence.tracks.findIndex(t => t.id === c.trackId), s.magnetic)); break }
    case 'clip.trim': { const p = schemas[method].parse(params), c = clip(p.clipId); apply(ops.trimClip(s.sequence, c.id, p.edge, micros(p.at), findMedia(s.media, c.mediaId))); break }
    case 'clip.split': { const p = schemas[method].parse(params), c = clip(p.clipId), at = micros(p.at); if (at <= c.start || at >= ops.clipEnd(c)) throw new Error('El corte debe estar dentro del clip'); const split = ops.splitAt(s.sequence, at, [c.id]); apply(split.seq); return { created: split.created, project: projectState() } }
    case 'clip.speed': { const p = schemas[method].parse(params); clip(p.clipId); s.setSpeed(p.clipId, p.speed); break }
    case 'clip.transition': { const p = schemas[method].parse(params), c = clip(p.clipId); if (p.name && !ops.nextContiguous(s.sequence, c)) throw new Error('La transición requiere otro clip contiguo'); s.setTransition(c.id, p.name); break }
    case 'clips.delete': { const p = schemas[method].parse(params); p.clipIds.forEach(clip); apply(ops.deleteClips(s.sequence, p.clipIds, p.ripple)); break }
    case 'clips.duplicate': { const p = schemas[method].parse(params); p.clipIds.forEach(clip); const result = ops.duplicateClips(s.sequence, p.clipIds, s.magnetic); apply(result.seq); return { created: result.created, project: projectState() } }
    case 'clips.group': { const p = schemas[method].parse(params); p.clipIds.forEach(clip); apply(p.ungroup ? ops.ungroupClips(s.sequence, p.clipIds) : ops.groupClips(s.sequence, p.clipIds)); break }
    case 'track.closeGaps': { const p = schemas[method].parse(params); track(p.trackId); apply(ops.closeGaps(s.sequence, p.trackId)); break }
    case 'history.undo': s.undo(); break
    case 'history.redo': s.redo(); break
    case 'playback.set': { const p = schemas[method].parse(params); if (p.at !== undefined) s.setPlayhead(micros(p.at)); if (p.playing !== undefined) s.setPlaying(p.playing); break }
    case 'export.start': {
      const p = schemas[method].parse(params)
      if (s.media.some(m => m.status === 'importing')) throw new Error('Espera a que termine la importación')
      const normalize = (path: string) => path.replaceAll('\\', '/').toLowerCase()
      if (usedAndOwnMedia(s.media, s.sequence).some(m => m.source && normalize(m.source.path) === normalize(p.path))) throw new Error('No se puede sobrescribir un medio original')
      const off = b.onExportProgress(b.agentProgress)
      try { const result = await b.startExport({ sequence: s.sequence, media: usedAndOwnMedia(s.media, s.sequence), output: p.path, format: p.format, quality: p.quality, useGpu: p.useGpu }); if (!result.ok && !result.cancelled) throw new Error(result.message); return result } finally { off() }
    }
    case 'frame.capture': { const p = schemas[method].parse(params); const result = await b.captureFrame({ sequence: s.sequence, media: usedAndOwnMedia(s.media, s.sequence), at: micros(p.at), name: `${p.name}-${crypto.randomUUID().slice(0, 8)}` }); if (!result.ok) throw new Error(result.message); return result }
    default: throw new Error('Comando no disponible en el editor')
  }
  return projectState()
}
