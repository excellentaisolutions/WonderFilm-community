import { mkdtempSync, writeFileSync, linkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { sameFile } from './file-identity'

it('reconoce rutas equivalentes y enlaces duros sin confundir archivos distintos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wonderfilm-identity-test-'))
  try {
    const source = join(dir, 'source.mp4'), alias = join(dir, 'alias.mp4'), other = join(dir, 'other.mp4')
    writeFileSync(source, 'source'); writeFileSync(other, 'other'); linkSync(source, alias)
    expect(sameFile(source, join(dir, 'nested', '..', 'source.mp4'))).toBe(true)
    expect(sameFile(source, alias)).toBe(true)
    if (process.platform === 'win32') expect(sameFile(source, source.toUpperCase())).toBe(true)
    expect(sameFile(source, other)).toBe(false)
    expect(sameFile(source, join(dir, 'new.mp4'))).toBe(false)
  } finally {
    if (dirname(resolve(dir)) === resolve(tmpdir()) && basename(dir).startsWith('wonderfilm-identity-test-')) rmSync(dir, { recursive: true, force: true })
  }
})
