import type { EffectId } from '@/features/timeline/model/types'

export const EFFECT_INFO: { id: EffectId; label: string; group: string }[] = [
  { id: 'bw', label: 'Blanco y negro', group: 'Color' },
  { id: 'warm', label: 'Cálido', group: 'Color' },
  { id: 'cool', label: 'Frío', group: 'Color' },
  { id: 'contrast', label: 'Más contraste', group: 'Ajustes' },
  { id: 'vignette', label: 'Viñeta', group: 'Estilo' },
  { id: 'blur', label: 'Desenfoque', group: 'Estilo' }
]

export function toggleEffect(list: EffectId[] | undefined, id: EffectId): EffectId[] {
  const current = list ?? []
  return current.includes(id) ? current.filter((e) => e !== id) : [...current, id]
}
