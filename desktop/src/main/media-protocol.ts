import { createReadStream, statSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'

export const SCHEME = 'wf-media'

// La pagina se carga desde file:// y `fetch` a otro esquema exige CORS: sin esta cabecera
// Chromium bloquea la lectura de los picos de audio (medido en la prueba E2E).
const CORS = { 'Access-Control-Allow-Origin': '*' }

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.json': 'application/json'
}

/** Solo se sirven ficheros que el proceso principal ha autorizado (importados o de cache). */
const allowed = new Set<string>()

export function allowPath(path: string): void {
  allowed.add(normalize(path))
}

const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase()

export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: false } }
  ])
}

/**
 * `wf-media://local/<ruta codificada>`. Responde a `Range` con 206: sin eso, un
 * `<video>` no puede buscar y la vista previa se queda en el primer fotograma.
 */
export function registerMediaProtocol(): void {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    const path = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!allowed.has(normalize(path))) return new Response('No autorizado', { status: 403 })

    let size: number
    try {
      size = statSync(path).size
    } catch {
      return new Response('No encontrado', { status: 404 })
    }
    const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
    const range = request.headers.get('range')
    const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null
    if (!m) {
      const body = Readable.toWeb(createReadStream(path)) as ReadableStream
      return new Response(body, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', ...CORS } })
    }
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
    return new Response(body, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        ...CORS
      }
    })
  })
}

export function mediaUrl(path: string): string {
  allowPath(path)
  return `${SCHEME}://local/${encodeURIComponent(path)}`
}
