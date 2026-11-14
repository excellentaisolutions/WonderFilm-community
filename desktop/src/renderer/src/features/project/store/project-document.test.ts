import { expect, it } from 'vitest'
import { projectDocumentSchema } from '../../../../../shared/project-document'
import { buildScenario } from '../mock/scenarios'

it('acepta proyectos existentes del editor', () => {
  const doc = buildScenario('normal')
  expect(projectDocumentSchema.safeParse(doc).success).toBe(true)
})
it.each(['transform', 'speed', 'trackId'])('rechaza %s corrupto antes de abrir el documento', (field) => {
  const doc = structuredClone(buildScenario('normal'))
  const clip = doc.sequence.clips[0] as unknown as Record<string, unknown>
  clip[field] = field === 'transform' ? null : field === 'speed' ? 0 : 'no-existe'
  expect(projectDocumentSchema.safeParse(doc).success).toBe(false)
})
it('rechaza identificadores duplicados', () => {
  const doc = buildScenario('normal')
  doc.sequence.clips.push({ ...doc.sequence.clips[0] })
  expect(projectDocumentSchema.safeParse(doc).success).toBe(false)
})
