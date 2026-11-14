import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import type { ProjectDocument, RecentEntry } from '../shared/contracts'
import { revalidate } from './media'
import { allowPath } from './media-protocol'
import { projectDocumentSchema } from '../shared/project-document'

export const PROJECT_EXTENSION = 'wonderfilm'
const FORMAT_VERSION = 1

// Validar antes de que los campos del documento lleguen al renderer.
const fileSchema = z.object({
  format: z.literal('wonderfilm'),
  version: z.number().int().min(1).max(FORMAT_VERSION)
}).and(projectDocumentSchema)

export function writeProject(path: string, doc: ProjectDocument): void {
  // El estado de importacion no se guarda: se recalcula al abrir.
  const media = doc.media.map(({ status: _s, progress: _p, ...m }) => m)
  writeFileSync(path, JSON.stringify({ format: 'wonderfilm', version: FORMAT_VERSION, savedAt: new Date().toISOString(), name: doc.name, media, sequence: doc.sequence }, null, 1))
  addRecent(path, doc)
}

export function readProject(path: string): ProjectDocument {
  const parsed = fileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
  if (!parsed.success) throw new Error('El archivo no es un proyecto de WonderFilm valido')
  const data = parsed.data as unknown as ProjectDocument
  const media = revalidate(data.media.map((m) => ({ ...m, status: 'ready' as const })))
  addRecent(path, data)
  return { name: data.name, media, sequence: data.sequence }
}

/** La portada de un proyecto: la miniatura del primer clip de la pista principal. */
function coverOf(doc: ProjectDocument): string | undefined {
  const main = doc.sequence.tracks.filter((t) => t.kind === 'visual').at(-1)
  const first = doc.sequence.clips.filter((c) => c.trackId === main?.id).sort((a, b) => a.start - b.start)[0]
  const media = doc.media.find((m) => m.id === first?.mediaId)
  return media?.source?.thumbPath
}

const recentsFile = () => {
  mkdirSync(app.getPath('userData'), { recursive: true })
  return join(app.getPath('userData'), 'recents.json')
}

export function listRecents(): RecentEntry[] {
  try {
    const list = JSON.parse(readFileSync(recentsFile(), 'utf8')) as RecentEntry[]
    return list.map((r) => {
      const thumb = r.thumbPath && existsSync(r.thumbPath) ? r.thumbPath : undefined
      if (thumb) allowPath(thumb)
      return { ...r, thumbPath: thumb, exists: existsSync(r.path) }
    })
  } catch {
    return []
  }
}

function addRecent(path: string, doc: ProjectDocument): void {
  const end = doc.sequence.clips.reduce((max, c) => Math.max(max, c.start + Math.round((c.sourceOut - c.sourceIn) / c.speed)), 0)
  const secs = Math.round(end / 1_000_000)
  const fps = doc.sequence.fps.num / doc.sequence.fps.den
  const entry: RecentEntry = {
    path,
    name: doc.name || basename(path).replace(/\.wonderfilm$/, ''),
    openedAt: new Date().toISOString(),
    durationLabel: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
    resolution: `${doc.sequence.width}×${doc.sequence.height} · ${Number.isInteger(fps) ? fps : fps.toFixed(2)} fps`,
    hue: (basename(dirname(path)).length * 37 + doc.name.length * 11) % 360,
    thumbPath: coverOf(doc)
  }
  const rest = listRecents().filter((r) => r.path.toLowerCase() !== path.toLowerCase())
  writeFileSync(recentsFile(), JSON.stringify([entry, ...rest].slice(0, 12), null, 1))
}
