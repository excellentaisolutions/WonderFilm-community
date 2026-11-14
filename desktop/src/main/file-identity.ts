import { realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

function canonical(path: string): string {
  let absolute = resolve(path)
  try { absolute = realpathSync(absolute) } catch { /* Una salida nueva aún no existe. */ }
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

export function sameFile(left: string, right: string): boolean {
  if (canonical(left) === canonical(right)) return true
  try {
    const a = statSync(left, { bigint: true }), b = statSync(right, { bigint: true })
    return a.ino !== 0n && a.dev === b.dev && a.ino === b.ino
  } catch { return false }
}
