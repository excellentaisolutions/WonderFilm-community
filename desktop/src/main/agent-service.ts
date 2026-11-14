import http from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { agentSchemas, type AgentMethod } from '../shared/agent-schema'
import { cancelExport, isExporting } from './export'

type Job = { id: string; owner: string; status: string; progress: number; result?: unknown; error?: string }
const envelope = z.object({ method: z.string(), params: z.unknown().default({}), client: z.string().min(1).max(100), requestId: z.string().uuid() }).strict()
export function startAgentService(win: BrowserWindow) {
  const directory = app.getPath('userData'), file = join(directory, 'agent-connection.json'), preference = join(directory, 'agent-settings.json')
  mkdirSync(directory, { recursive: true })
  let enabled = false
  try { enabled = JSON.parse(readFileSync(preference, 'utf8')).enabled === true } catch { /* default disabled */ }
  let token = randomBytes(32).toString('hex'), port = 0, generation = 0, busy = false
  const jobs = new Map<string, Job>()
  const activity: { at: string; client: string; method: string; status: string }[] = []
  const cache = new Map<string, { signature: string; promise: Promise<unknown>; settled: boolean }>()
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  const state = () => ({ enabled, busy, activity: activity.slice(0, 20), jobs: [...jobs.values()].slice(-10), mcp: { mcpServers: { wonderfilm: {
    command: process.execPath, args: [join(app.getAppPath(), 'agents/entry.cjs'), '--mcp'],
    env: { ELECTRON_RUN_AS_NODE: '1', WONDERFILM_CONNECTION: file, WONDERFILM_CLIENT: 'my-agent' }
  } } } })
  const emit = () => { if (!win.isDestroyed()) win.webContents.send('agent:state', state()) }
  const persist = () => { writeFileSync(file, JSON.stringify({ port, token, enabled }), { mode: 0o600 }); writeFileSync(preference, JSON.stringify({ enabled })) }
  const log = (client: string, method: string, status: string) => { activity.unshift({ at: new Date().toISOString(), client, method, status }); activity.splice(40); emit() }
  function command(method: AgentMethod, params: unknown) {
    if (win.isDestroyed() || win.webContents.isLoading()) throw new Error('El editor no está disponible')
    const id = randomUUID()
    return new Promise<unknown>((resolve, reject) => { pending.set(id, { resolve, reject }); win.webContents.send('agent:command', { id, method, params }) })
  }
  ipcMain.on('agent:reply', (event, raw: unknown) => {
    if (event.sender !== win.webContents) return
    const parsed = z.object({ id: z.string().uuid(), result: z.unknown().optional(), error: z.string().optional() }).strict().safeParse(raw)
    if (!parsed.success) return
    const p = pending.get(parsed.data.id); if (!p) return
    pending.delete(parsed.data.id)
    if (parsed.data.error) p.reject(new Error(parsed.data.error)); else p.resolve(parsed.data.result)
  })
  const cancelPending = () => { for (const p of pending.values()) p.reject(new Error('El editor se cerró o recargó')); pending.clear() }
  win.webContents.on('render-process-gone', cancelPending)
  win.webContents.on('did-start-loading', cancelPending)
  win.on('closed', cancelPending)
  function setEnabled(value: boolean) { generation++; enabled = value; token = randomBytes(32).toString('hex'); if (!value && busy) cancelExport(); persist(); emit(); return state() }
  ipcMain.handle('agent:status', () => state())
  ipcMain.handle('agent:enable', (_e, value: unknown) => setEnabled(z.boolean().parse(value)))
  ipcMain.handle('agent:revoke', () => setEnabled(false))
  const tools = () => Object.entries(agentSchemas).map(([method, schema]) => ({ name: method.replaceAll('.', '_'), description: description(method), inputSchema: zodToJsonSchema(schema, { $refStrategy: 'none' }) }))
  function validatePaths(method: string, params: unknown) {
    const p = params as { path?: string; paths?: string[]; overwrite?: boolean; format?: string }
    for (const target of p.paths ?? (p.path ? [p.path] : [])) {
      if (!isAbsolute(target) || target.startsWith('\\\\') || target.includes('\0') || target.slice(2).includes(':')) throw new Error('Usa una ruta absoluta local, sin dispositivos ni recursos de red')
      if (method === 'media.import' || method === 'project.open') { if (!existsSync(target) || !statSync(target).isFile()) throw new Error('No existe el archivo local solicitado') }
      else {
        if (!existsSync(dirname(target))) throw new Error('La carpeta de salida no existe')
        if (existsSync(target) && !p.overwrite) throw new Error('El archivo ya existe: usa otra ruta u overwrite explícito')
      }
      if (method.startsWith('project.') && extname(target).toLowerCase() !== '.wonderfilm') throw new Error('El proyecto debe usar extensión .wonderfilm')
      if (method === 'export.start') {
        const extension = ({ 'mp4-hevc': '.mp4', 'mov-prores': '.mov' } as Record<string, string>)[p.format!] ?? `.${p.format}`
        if (extname(target).toLowerCase() !== extension) throw new Error('La extensión no corresponde al formato')
      }
    }
  }
  async function dispatch(method: AgentMethod | 'tools', params: unknown, client: string) {
    if (method === 'tools') return tools()
    if (method === 'capabilities.get') return { version: app.getVersion(), timeInput: 'seconds', stateTimeUnit: 'microseconds', methods: Object.keys(agentSchemas), limits: ['Control local del proyecto visible', 'Reemplazar solapes sigue las reglas del editor', 'Inversa con copia temporal del visor; transiciones con fotogramas de borde', 'Sin API pública de nube'] }
    if (method === 'jobs.status' || method === 'jobs.cancel') {
      const { jobId } = agentSchemas[method].parse(params), item = jobs.get(jobId)
      if (!item || item.owner !== client) throw new Error('Trabajo no disponible para este cliente')
      if (method === 'jobs.cancel' && item.status === 'running') { item.status = 'cancelling'; cancelExport(); emit() }
      return item
    }
    if (method === 'project.get') return command(method, params)
    if (busy || isExporting()) throw new Error('Hay una operación en curso. Consulta el estado antes de editar')
    validatePaths(method, params)
    busy = true; emit()
    if (method === 'export.start') {
      if (jobs.size >= 100) { const old = [...jobs].find(([, j]) => !['running', 'cancelling'].includes(j.status)); if (old) jobs.delete(old[0]) }
      const item: Job = { id: randomUUID(), owner: client, status: 'running', progress: 0 }; jobs.set(item.id, item)
      void command(method, params).then(result => {
        item.result = result
        item.status = result && typeof result === 'object' && 'cancelled' in result && result.cancelled ? 'cancelled' : 'completed'
        if (item.status === 'completed') item.progress = 1
      }, error => { item.status = item.status === 'cancelling' ? 'cancelled' : 'failed'; item.error = error.message }).finally(() => { busy = false; log(client, method, item.status) })
      return { jobId: item.id }
    }
    try { return await command(method, params) } finally { busy = false; emit() }
  }
  const server = http.createServer(async (req, res) => {
    const reply = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
    const provided = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, '')), expected = Buffer.from(token)
    if (!enabled || req.headers.origin || req.headers.host !== `127.0.0.1:${port}` || provided.length !== expected.length || !timingSafeEqual(provided, expected)) return reply(403, { error: 'Acceso no autorizado. Activa Integraciones IA y usa la conexión vigente' })
    if (req.method !== 'POST' || req.url !== '/call') return reply(404, { error: 'Ruta desconocida' })
    const epoch = generation
    try {
      let body = ''; for await (const part of req) { body += part; if (Buffer.byteLength(body) > 256 * 1024) throw new Error('Petición demasiado grande') }
      if (!enabled || epoch !== generation) throw new Error('Acceso revocado')
      const input = envelope.parse(JSON.parse(body)), method = input.method as AgentMethod
      if (method !== ('tools' as string) && !Object.hasOwn(agentSchemas, method)) throw new Error('Herramienta desconocida')
      const params = method === ('tools' as string) ? {} : agentSchemas[method].parse(input.params)
      const key = `${input.client}:${input.requestId}`, signature = JSON.stringify({ method, params })
      let cached = cache.get(key)
      if (cached && cached.signature !== signature) throw new Error('requestId ya utilizado con otros parámetros')
      if (!cached) {
        if (cache.size >= 1000) { const old = [...cache].find(([, c]) => c.settled); if (!old) throw new Error('Demasiadas solicitudes pendientes'); cache.delete(old[0]) }
        cached = { signature, settled: false, promise: Promise.resolve().then(() => dispatch(method, params, input.client)) }; cache.set(key, cached)
        const entry = cached; void entry.promise.then(() => { entry.settled = true }, () => { entry.settled = true })
      }
      const result = await cached.promise; log(input.client, method, 'ok'); reply(200, { result })
    } catch (error) { reply(400, { error: error instanceof Error ? error.message : String(error) }) }
  })
  server.requestTimeout = 30000; server.headersTimeout = 10000
  server.listen(0, '127.0.0.1', () => { const a = server.address(); if (a && typeof a !== 'string') port = a.port; persist(); emit() })
  const progress = (fraction: number) => { const active = [...jobs.values()].find(j => j.status === 'running'); if (active) { active.progress = fraction; emit() } }
  ipcMain.on('agent:progress', (e, value: unknown) => { if (e.sender === win.webContents && typeof value === 'number' && Number.isFinite(value)) progress(value) })
  return { close: () => { enabled = false; token = randomBytes(32).toString('hex'); writeFileSync(file, JSON.stringify({ enabled: false, port, token })); cancelPending(); server.close() }, state }
}
function description(method: string) {
  const detail: Record<string, string> = {
    'project.get': 'Inspect the visible project, media and timeline. State time fields are integer microseconds; command time arguments use seconds.',
    'project.create': 'Create visible project. Rejects unsaved changes unless discardChanges is explicitly true.',
    'project.save': 'Save editable .wonderfilm locally. Existing output requires overwrite=true.',
    'media.import': 'Import local video/audio/image paths and wait for metadata, thumbnails and proxies. Originals remain unchanged.',
    'clip.add': 'Insert media on a track at seconds, with sourceIn and optional duration. Overlaps replace existing clips following editor rules; undo available.',
    'clip.move': 'Move clip to track and seconds; overlap replacement and magnetic mode follow editor rules.',
    'clip.trim': 'Trim start/end to absolute timeline seconds, bounded by source, neighbours and one frame. Inspect returned state for applied values.',
    'export.start': 'Export current project snapshot. Returns jobId; poll jobs.status. No input media may be overwritten.',
    'frame.capture': 'Export full-resolution PNG at timeline seconds to Pictures/WonderFilm. Returns artifact.',
    'clip.transition': 'Apply crossfade, fade to black, wipe, zoom, slide or blur. Non-black transitions overlap held boundary frames while preserving timeline duration.'
  }
  return detail[method] ?? `${method}: control the visible WonderFilm editor. Input time values are seconds. Inspect project.get after editing.`
}
