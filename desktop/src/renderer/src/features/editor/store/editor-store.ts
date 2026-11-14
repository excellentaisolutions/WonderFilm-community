import { create } from 'zustand'
import { requestProjectDecision } from '@/features/project/store/project-decision'
import { AUDIO_LIBRARY, buildScenario, TEXT_PRESETS, type Scenario } from '@/features/project/mock/scenarios'
import * as ops from '@/features/timeline/model/operations'
import { snapToFrame } from '@/features/timeline/model/time'
import { SECOND, type Clip, type MediaItem, type Micros, type Rational, type Sequence, type Track, type TrackKind } from '@/features/timeline/model/types'
import type { MediaEvent, ProjectDocument } from '../../../../../shared/contracts'

export type Tool = 'select' | 'razor'
export type Screen = 'start' | 'editor'
export type Dialog = null | 'new-project' | 'export' | 'shortcuts' | 'agents'
export type LibraryTab = 'media' | 'audio' | 'text' | 'transitions' | 'effects'

const HISTORY_LIMIT = 100
export const MIN_ZOOM = 4
export const MAX_ZOOM = 400
export const bridge = () => (typeof window !== 'undefined' ? window.wonderfilm : undefined)

export interface NewProjectSettings {
  name: string
  width: number
  height: number
  fps: Rational
}

interface EditorState {
  sessionId: number
  saving: boolean
  agentBusy: boolean
  screen: Screen
  /** Solo en el proyecto de ejemplo: los estados de interfaz para revisarlos. */
  scenario: Scenario | null
  projectName: string
  projectPath: string | null
  dirty: boolean
  savedAt: number | null
  media: MediaItem[]
  sequence: Sequence
  /** Secuencia provisional durante un arrastre: se pinta, pero no entra en el historial hasta soltar. */
  preview: Sequence | null
  past: Sequence[]
  future: Sequence[]
  selection: string[]
  selectedTrackId: string | null
  clipboard: Clip[]
  tool: Tool
  playhead: Micros
  playing: boolean
  previewMuted: boolean
  /** Pixeles por segundo. */
  zoom: number
  magnetic: boolean
  snapping: boolean
  snapGuide: Micros | null
  dialog: Dialog
  libraryTab: LibraryTab
  toast: string | null
  /** Ficheros soltados en la linea de tiempo que esperan a importarse para colocarse. */
  pendingDrops: { path: string; trackId: string | null; at: Micros }[]

  openProject: (scenario: Scenario, discardChanges?: boolean) => void
  createProject: (settings: NewProjectSettings, discardChanges?: boolean) => void
  openProjectFile: (path?: string, discardChanges?: boolean) => Promise<void>
  saveProject: (saveAs?: boolean, silent?: boolean) => Promise<boolean>
  setProjectName: (name: string) => void
  goHome: () => void
  setScenario: (scenario: Scenario) => void
  setDialog: (dialog: Dialog) => void
  setLibraryTab: (tab: LibraryTab) => void
  showToast: (message: string | null) => void

  commit: (next: Sequence) => void
  setPreview: (seq: Sequence | null) => void
  undo: () => void
  redo: () => void

  select: (ids: string[], additive?: boolean) => void
  selectTrack: (trackId: string | null) => void
  setTool: (tool: Tool) => void
  setPlayhead: (t: Micros) => void
  setPlaying: (playing: boolean) => void
  setZoom: (zoom: number) => void
  setSnapGuide: (t: Micros | null) => void
  toggleMagnetic: () => void
  toggleSnapping: () => void

  split: () => void
  splitClipAt: (clipId: string, t: Micros) => void
  deleteSelection: (ripple: boolean) => void
  duplicateSelection: () => void
  copySelection: () => void
  paste: () => void
  groupSelection: () => void
  ungroupSelection: () => void
  closeGaps: () => void
  trimSelectionToPlayhead: (edge: 'start' | 'end') => void
  addMedia: (mediaId: string, trackId: string | null, at: Micros) => void
  appendMedia: (mediaId: string) => void
  addTrack: (kind: TrackKind) => void
  updateTrack: (trackId: string, patch: Partial<Omit<Track, 'id' | 'kind'>>) => void
  updateClip: (clipId: string, patch: Partial<Omit<Clip, 'id' | 'start' | 'trackId'>>) => void
  setSpeed: (clipId: string, speed: number) => void
  setTransition: (clipId: string, name: string | null) => void
  updateSequence: (patch: Partial<Pick<Sequence, 'width' | 'height' | 'fps'>>) => void
  importMedia: (paths?: string[], placement?: { trackId: string | null; at: Micros }) => Promise<void>
  applyMediaEvent: (e: MediaEvent) => void
  relinkMedia: (mediaId: string) => Promise<void>
  removeMedia: (mediaId: string) => void
}

const initial = buildScenario('normal')
function markDirty(dirty: boolean) {
  void bridge()?.setDirty(dirty)
}
function canReplaceProject(dirty: boolean, proceed: () => void): boolean {
  const session = useEditor.getState().sessionId
  if (dirty) requestProjectDecision('replace', () => { if (useEditor.getState().sessionId === session) proceed() })
  return !dirty
}

const freshSession = {
  preview: null,
  past: [],
  future: [],
  selection: [],
  selectedTrackId: null,
  playing: false,
  dialog: null,
  snapGuide: null
} satisfies Partial<EditorState>

export const useEditor = create<EditorState>((set, get) => ({
  sessionId: 0,
  saving: false,
  agentBusy: false,
  screen: 'start',
  scenario: 'normal',
  projectName: initial.name,
  projectPath: null,
  dirty: false,
  savedAt: null,
  media: initial.media,
  sequence: initial.sequence,
  ...freshSession,
  clipboard: [],
  tool: 'select',
  playhead: 3 * SECOND,
  previewMuted: false,
  zoom: 28,
  magnetic: true,
  snapping: true,
  libraryTab: 'media',
  toast: null,
  pendingDrops: [],

  openProject: (scenario, discardChanges = false) => {
    if (!discardChanges && !canReplaceProject(get().dirty, () => get().openProject(scenario, true))) return
    const data = buildScenario(scenario)
    markDirty(false)
    set({
      ...freshSession,
      sessionId: get().sessionId + 1,
      screen: 'editor',
      scenario,
      projectName: data.name,
      projectPath: null,
      dirty: false,
      savedAt: null,
      media: data.media,
      sequence: data.sequence,
      playhead: scenario === 'empty' ? 0 : 3 * SECOND
    })
  },

  createProject: ({ name, width, height, fps }, discardChanges = false) => {
    if (!discardChanges && !canReplaceProject(get().dirty, () => get().createProject({ name, width, height, fps }, true))) return
    const data = buildScenario('empty')
    markDirty(false)
    set({
      ...freshSession,
      sessionId: get().sessionId + 1,
      screen: 'editor',
      scenario: null,
      projectName: name || 'Proyecto sin título',
      projectPath: null,
      dirty: false,
      savedAt: null,
      media: [],
      sequence: { ...data.sequence, width, height, fps },
      playhead: 0
    })
  },

  openProjectFile: async (path, discardChanges = false) => {
    const b = bridge()
    if (!b) return
    const sessionId = get().sessionId
    const r = await b.openProject(path)
    if (!r) return
    if ('error' in r) return get().showToast(r.error)
    if (get().sessionId !== sessionId || (!discardChanges && !canReplaceProject(get().dirty, () => void get().openProjectFile(r.path, true)))) return
    const missing = r.doc.media.filter((m) => m.status === 'missing').length
    markDirty(false)
    set({
      ...freshSession,
      sessionId: get().sessionId + 1,
      screen: 'editor',
      scenario: null,
      projectName: r.doc.name,
      projectPath: r.path,
      dirty: false,
      savedAt: Date.now(),
      // Los preajustes se guardan para que la exportacion los encuentre, pero no son medios del proyecto.
      media: r.doc.media.filter((m) => m.source || !TEXT_PRESETS.some(p => p.id === m.id)),
      sequence: r.doc.sequence,
      playhead: 0,
      toast: missing ? `${missing} ${missing === 1 ? 'medio no se encuentra' : 'medios no se encuentran'}: vuelve a vincularlos` : null
    })
  },

  saveProject: async (saveAs = false, silent = false) => {
    const b = bridge()
    const { projectName, media, sequence, projectPath, scenario, sessionId, saving } = get()
    if (!b || saving) return false
    if (scenario && !saveAs && !projectPath) saveAs = true
    const doc: ProjectDocument = { name: projectName, media: usedAndOwnMedia(media, sequence), sequence }
    set({ saving: true })
    try {
      const path = await b.saveProject(doc, projectPath, saveAs)
      if (!path) return false
      const current = get()
      if (current.sessionId !== sessionId) { markDirty(current.dirty); return true }
      const dirty = current.projectName !== projectName || current.media !== media || current.sequence !== sequence
      set({ projectPath: path, dirty, savedAt: Date.now(), scenario: null,
        ...(silent ? {} : { toast: dirty ? 'Versión guardada; quedan cambios sin guardar' : 'Proyecto guardado' }) })
      markDirty(dirty)
      return true
    } catch (error) {
      get().showToast(`No se pudo guardar: ${error instanceof Error ? error.message : String(error)}`)
      return false
    } finally {
      set({ saving: false })
    }
  },

  setProjectName: (name) => {
    set({ projectName: name, dirty: true })
    markDirty(true)
  },

  goHome: () => set({ screen: 'start', playing: false, dialog: null }),
  setScenario: (scenario) => get().openProject(scenario),
  setDialog: (dialog) => set({ dialog, playing: false }),
  setLibraryTab: (libraryTab) => set({ libraryTab }),
  showToast: (toast) => set({ toast }),

  commit: (next) => {
    const { sequence, past, magnetic, dirty } = get()
    const normalized = ops.applyMagnetic(next, magnetic)
    const ids = new Set(normalized.clips.map((c) => c.id))
    if (!dirty) markDirty(true)
    set({
      sequence: normalized,
      preview: null,
      past: [...past, sequence].slice(-HISTORY_LIMIT),
      future: [],
      selection: get().selection.filter((id) => ids.has(id)),
      snapGuide: null,
      dirty: true
    })
  },

  setPreview: (preview) => set({ preview }),

  undo: () => {
    const { past, sequence, future } = get()
    const prev = past.at(-1)
    if (!prev) return
    set({ sequence: prev, past: past.slice(0, -1), future: [sequence, ...future], preview: null, dirty: true })
    markDirty(true)
  },

  redo: () => {
    const { past, sequence, future } = get()
    const next = future[0]
    if (!next) return
    set({ sequence: next, past: [...past, sequence], future: future.slice(1), preview: null, dirty: true })
    markDirty(true)
  },

  select: (ids, additive = false) => {
    const { sequence, selection } = get()
    const expanded = ops.expandGroups(sequence, ids)
    if (!additive) return set({ selection: expanded, selectedTrackId: null })
    const allSelected = expanded.every((id) => selection.includes(id))
    set({
      selection: allSelected ? selection.filter((id) => !expanded.includes(id)) : [...new Set([...selection, ...expanded])],
      selectedTrackId: null
    })
  },

  selectTrack: (selectedTrackId) => set({ selectedTrackId, selection: [] }),
  setTool: (tool) => set({ tool }),
  setPlayhead: (t) => set({ playhead: Math.max(0, snapToFrame(t, get().sequence.fps)) }),
  setPlaying: (playing) => set({ playing }),
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  setSnapGuide: (snapGuide) => set({ snapGuide }),

  toggleMagnetic: () => {
    const magnetic = !get().magnetic
    set({ magnetic })
    if (magnetic) get().commit(get().sequence)
  },

  toggleSnapping: () => set({ snapping: !get().snapping }),

  split: () => {
    const { sequence, playhead, selection, selectedTrackId } = get()
    const targets = selectedTrackId
      ? sequence.clips.filter((c) => c.trackId === selectedTrackId).map((c) => c.id)
      : selection
    const { seq, created } = ops.splitAt(sequence, playhead, targets)
    if (!created.length) return get().showToast('No hay ningún clip bajo el cabezal para dividir')
    get().commit(seq)
  },

  splitClipAt: (clipId, t) => {
    const { sequence } = get()
    const { seq, created } = ops.splitAt(sequence, snapToFrame(t, sequence.fps), [clipId])
    if (created.length) get().commit(seq)
  },

  deleteSelection: (ripple) => {
    const { sequence, selection } = get()
    if (!selection.length) return
    get().commit(ops.deleteClips(sequence, selection, ripple))
    set({ selection: [] })
  },

  duplicateSelection: () => {
    const { sequence, selection, magnetic } = get()
    if (!selection.length) return
    const { seq, created } = ops.duplicateClips(sequence, selection, magnetic)
    get().commit(seq)
    set({ selection: created })
  },

  copySelection: () => {
    const { sequence, selection } = get()
    const clipboard = sequence.clips.filter((c) => selection.includes(c.id))
    if (clipboard.length) set({ clipboard, toast: `${clipboard.length} ${clipboard.length === 1 ? 'clip copiado' : 'clips copiados'}` })
  },

  paste: () => {
    const { sequence, clipboard, playhead, magnetic } = get()
    if (!clipboard.length) return
    const { seq, created } = ops.pasteClips(sequence, clipboard, playhead, magnetic)
    if (!created.length) return get().showToast('Las pistas de origen ya no existen o están bloqueadas')
    get().commit(seq)
    set({ selection: created })
  },

  groupSelection: () => {
    const { sequence, selection } = get()
    if (selection.length > 1) get().commit(ops.groupClips(sequence, selection))
  },

  ungroupSelection: () => {
    const { sequence, selection } = get()
    if (selection.length) get().commit(ops.ungroupClips(sequence, selection))
  },

  closeGaps: () => {
    const { sequence, selectedTrackId, selection } = get()
    const trackId = selectedTrackId ?? sequence.clips.find((c) => c.id === selection[0])?.trackId
    if (!trackId) return get().showToast('Selecciona una pista o un clip para cerrar sus huecos')
    get().commit(ops.closeGaps(sequence, trackId))
  },

  trimSelectionToPlayhead: (edge) => {
    const { sequence, selection, playhead } = get()
    let seq = sequence
    for (const id of selection) {
      const clip = seq.clips.find((c) => c.id === id)
      if (clip) seq = ops.trimClip(seq, id, edge, playhead, findMedia(get().media, clip.mediaId))
    }
    if (seq !== sequence) get().commit(seq)
  },

  addMedia: (mediaId, trackId, at) => {
    const { sequence, magnetic, media } = get()
    const item = findMedia(media, mediaId)
    if (!item) return
    if (item.status === 'missing') return get().showToast('Este medio no se encuentra. Vuelve a vincularlo antes de usarlo')
    if (item.status === 'importing' && item.duration === null && item.kind !== 'image') return get().showToast('Espera a que termine de importarse')
    const { seq, clipId } = ops.insertMedia(sequence, item, trackId, snapToFrame(at, sequence.fps), magnetic)
    if (!clipId) return get().showToast('La pista está bloqueada')
    if (!media.some((x) => x.id === item.id) && item.kind === 'audio') set({ media: [...media, item] })
    get().commit(seq)
    set({ selection: [clipId] })
  },

  appendMedia: (mediaId) => {
    const { sequence, media } = get()
    const item = findMedia(media, mediaId)
    if (!item) return
    const kind = ops.trackKindFor(item.kind)
    const trackId = kind === 'visual' ? ops.mainTrackId(sequence) : sequence.tracks.find((t) => t.kind === 'audio')?.id
    get().addMedia(mediaId, trackId ?? null, trackId ? ops.trackEnd(sequence, trackId) : 0)
  },

  addTrack: (kind) => get().commit(ops.addTrack(get().sequence, kind).seq),
  updateTrack: (trackId, patch) => get().commit(ops.updateTrack(get().sequence, trackId, patch)),
  updateClip: (clipId, patch) => get().commit(ops.updateClip(get().sequence, clipId, patch)),
  setSpeed: (clipId, speed) => get().commit(ops.setSpeed(get().sequence, clipId, speed)),

  setTransition: (clipId, name) => {
    const { sequence } = get()
    const clip = sequence.clips.find((c) => c.id === clipId)
    if (name && clip && !ops.nextContiguous(sequence, clip)) {
      return get().showToast('La transición necesita otro clip pegado justo detrás')
    }
    get().commit(ops.setTransition(sequence, clipId, name))
  },

  updateSequence: (patch) => get().commit({ ...get().sequence, ...patch }),

  importMedia: async (paths, placement) => {
    const b = bridge()
    if (!b) return get().showToast('Importar archivos solo funciona en la app de escritorio')
    if (paths && placement) {
      set({ pendingDrops: [...get().pendingDrops, ...paths.map((path) => ({ path, ...placement }))] })
    }
    const count = await b.importMedia(paths)
    if (count) set({ toast: `Importando ${count} ${count === 1 ? 'archivo' : 'archivos'}…`, libraryTab: 'media' })
  },

  applyMediaEvent: (e) => {
    if (e.type === 'failed') return set({ toast: `${e.name}: ${e.message}` })
    if (e.type === 'added') {
      const exists = get().media.some((m) => m.id === e.item.id)
      set({ media: exists ? get().media.map((m) => (m.id === e.item.id ? e.item : m)) : [...get().media, e.item], dirty: true })
      markDirty(true)
      const drops = get().pendingDrops
      const drop = drops.find((d) => d.path === e.item.source?.path)
      if (!drop) return
      set({ pendingDrops: drops.filter((d) => d !== drop) })
      get().addMedia(e.item.id, drop.trackId, drop.at)
      // Varios ficheros soltados a la vez van uno detras de otro, no encima.
      const placed = get().sequence.clips.find((c) => c.id === get().selection[0])
      if (placed) {
        const end = ops.clipEnd(placed)
        set({ pendingDrops: get().pendingDrops.map((d) => (d.trackId === drop.trackId && d.at === drop.at ? { ...d, trackId: placed.trackId, at: end } : d)) })
      }
      return
    }
    set({ media: get().media.map((m) => (m.id === e.id ? { ...m, ...e.patch } : m)) })
  },

  relinkMedia: async (mediaId) => {
    const b = bridge()
    const item = get().media.find((m) => m.id === mediaId)
    if (!item) return
    if (!b || !item.source) {
      set({ media: get().media.map((x) => (x.id === mediaId ? { ...x, status: 'ready' } : x)), toast: 'Medio vinculado de nuevo' })
      return
    }
    await b.relinkMedia(mediaId, item.name)
  },

  removeMedia: (mediaId) => {
    const { sequence } = get()
    if (sequence.clips.some((c) => c.mediaId === mediaId)) {
      return get().showToast('Este medio se usa en la línea de tiempo. Borra antes sus clips')
    }
    set({ media: get().media.filter((x) => x.id !== mediaId), dirty: true })
    markDirty(true)
  }
}))

/**
 * Los medios del proyecto con fichero, mas los preajustes (titulos, musica de muestra) que use
 * algun clip. Sin estos ultimos la exportacion contaba un titulo como «archivo que falta».
 */
export function usedAndOwnMedia(media: MediaItem[], sequence: Sequence): MediaItem[] {
  const own = media.filter((m) => m.source)
  const ids = new Set(own.map((m) => m.id))
  const presets = [...new Set(sequence.clips.map((c) => c.mediaId))]
    .filter((id) => !ids.has(id))
    .map((id) => findMedia(media, id))
    .filter((m): m is MediaItem => Boolean(m))
  return [...own, ...presets]
}

export function findMedia(media: MediaItem[], id: string): MediaItem | undefined {
  return media.find((x) => x.id === id) ?? TEXT_PRESETS.find((x) => x.id === id) ?? AUDIO_LIBRARY.find((x) => x.id === id)
}

/** La secuencia que se pinta: la provisional del arrastre o la confirmada. */
export const useVisibleSequence = () => useEditor((s) => s.preview ?? s.sequence)
