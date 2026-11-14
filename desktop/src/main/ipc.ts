import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { EXPORT_FORMATS, EXPORT_QUALITIES, EXTENSION } from '../shared/export-graph'
import { cancelExport, detectGpu, exportVideo } from './export'
import { importFile, type ImportEvents } from './media'
import type { ExportRequest, ProjectDocument } from '../shared/contracts'
import { listRecents, PROJECT_EXTENSION, readProject, writeProject } from './project-file'
import { projectDocumentSchema } from '../shared/project-document'
import { reversePreview } from './reverse-preview'

/** Solo para las pruebas automaticas: los dialogos nativos no se pueden manejar desde fuera. */
const E2E_DIR = process.env.WONDERFILM_E2E_DIR

const MEDIA_FILTERS = [
  { name: 'Video, audio e imagen', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mts', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] },
  { name: 'Todos los archivos', extensions: ['*'] }
]

const windowOf = (e: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender)!

function eventsFor(e: IpcMainInvokeEvent): ImportEvents {
  const send = (payload: unknown) => !e.sender.isDestroyed() && e.sender.send('media:event', payload)
  return {
    added: (item) => send({ type: 'added', item }),
    updated: (id, patch) => send({ type: 'updated', id, patch }),
    failed: (name, message) => send({ type: 'failed', name, message })
  }
}

const docSchema = projectDocumentSchema
const exportSchema = z.object({
  sequence: z.any(),
  media: z.array(z.any()),
  format: z.enum(EXPORT_FORMATS),
  quality: z.enum(EXPORT_QUALITIES),
  output: z.string().min(3),
  useGpu: z.boolean().optional()
})

let dirty = false
export const isDirty = () => dirty

export function registerIpc(): void {
  ipcMain.handle('media:reverse-preview', async (_e, raw: unknown) => {
    try {
      const p = z.object({ path: z.string().min(1), from: z.number().finite().nonnegative(), to: z.number().finite().positive() }).strict().refine(p => p.to > p.from).parse(raw)
      return { path: await reversePreview(p.path, p.from, p.to) }
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) } }
  })
  ipcMain.handle('media:import', async (e, raw: unknown) => {
    let paths = z.array(z.string()).max(500).optional().parse(raw)
    if (!paths) {
      const r = await dialog.showOpenDialog(windowOf(e), { title: 'Importar medios', properties: ['openFile', 'multiSelections'], filters: MEDIA_FILTERS })
      if (r.canceled) return 0
      paths = r.filePaths
    }
    const valid = paths.filter((p) => existsSync(p))
    const events = eventsFor(e)
    // En serie: varias decodificaciones en paralelo ahogan el disco y la CPU.
    void (async () => {
      for (const p of valid) await importFile(p, events)
    })()
    return valid.length
  })

  ipcMain.handle('media:relink', async (e, raw: unknown) => {
    const { id, name } = z.object({ id: z.string(), name: z.string() }).parse(raw)
    const r = await dialog.showOpenDialog(windowOf(e), { title: `Buscar «${name}»`, properties: ['openFile'], filters: MEDIA_FILTERS })
    if (r.canceled) return false
    await importFile(r.filePaths[0], eventsFor(e), id)
    return true
  })

  ipcMain.handle('project:save', async (e, raw: unknown) => {
    const { doc, path, saveAs } = z.object({ doc: docSchema, path: z.string().nullable(), saveAs: z.boolean() }).parse(raw)
    let target = saveAs ? null : path
    if (!target) {
      if (E2E_DIR) target = join(E2E_DIR, `${doc.name || 'proyecto'}.${PROJECT_EXTENSION}`)
      else {
        const r = await dialog.showSaveDialog(windowOf(e), {
          title: 'Guardar proyecto',
          defaultPath: `${doc.name || 'Proyecto sin titulo'}.${PROJECT_EXTENSION}`,
          filters: [{ name: 'Proyecto de WonderFilm', extensions: [PROJECT_EXTENSION] }]
        })
        if (r.canceled || !r.filePath) return null
        target = r.filePath
      }
    }
    writeProject(target, doc as ProjectDocument)
    dirty = false
    return target
  })

  ipcMain.handle('project:open', async (e, raw: unknown) => {
    let path = z.string().optional().parse(raw)
    if (!path) {
      const r = await dialog.showOpenDialog(windowOf(e), {
        title: 'Abrir proyecto',
        properties: ['openFile'],
        filters: [{ name: 'Proyecto de WonderFilm', extensions: [PROJECT_EXTENSION] }]
      })
      if (r.canceled) return null
      path = r.filePaths[0]
    }
    if (!existsSync(path)) return { error: 'El proyecto ya no esta en esa ubicacion' }
    try {
      return { path, doc: readProject(path) }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('project:recents', () => listRecents())

  ipcMain.handle('project:dirty', (_e, raw: unknown) => {
    dirty = z.boolean().parse(raw)
  })

  ipcMain.handle('export:choose', async (e, raw: unknown) => {
    const { name, format } = z.object({ name: z.string(), format: z.enum(EXPORT_FORMATS) }).parse(raw)
    const ext = EXTENSION[format]
    if (E2E_DIR) return join(E2E_DIR, `${name}.${ext}`)
    const r = await dialog.showSaveDialog(windowOf(e), { title: 'Exportar video', defaultPath: `${name}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
    return r.canceled ? null : r.filePath
  })

  ipcMain.handle('export:start', async (e, raw: unknown) => {
    const req = exportSchema.parse(raw)
    return exportVideo(req as ExportRequest, (fraction) => !e.sender.isDestroyed() && e.sender.send('export:progress', fraction))
  })

  ipcMain.handle('export:cancel', () => cancelExport())
  ipcMain.handle('export:hardware', async () => (await detectGpu()).label)

  // Captura de fotograma: el mismo motor que la exportacion, un solo fotograma en PNG,
  // y el resultado entra en la biblioteca como una imagen mas.
  ipcMain.handle('frame:capture', async (e, raw: unknown) => {
    const { sequence, media, at, name } = z.object({ sequence: z.any(), media: z.array(z.any()), at: z.number().min(0), name: z.string().max(120) }).parse(raw)
    const dir = E2E_DIR ?? join(app.getPath('pictures'), 'WonderFilm')
    mkdirSync(dir, { recursive: true })
    const stamp = new Date(at / 1000).toISOString().slice(11, 22).replace(/[:.]/g, '-')
    const safe = name.replace(/[<>:"/\\|?*]+/g, '').trim() || 'fotograma'
    const output = join(dir, `${safe} ${stamp}.png`)
    const r = await exportVideo({ sequence, media, format: 'png', quality: 'high', output, frameAt: at } as ExportRequest, () => undefined)
    if (r.ok) void importFile(output, eventsFor(e))
    return r
  })

  ipcMain.handle('shell:reveal', (_e, raw: unknown) => {
    const path = z.string().parse(raw)
    if (existsSync(path)) shell.showItemInFolder(path)
  })
}
