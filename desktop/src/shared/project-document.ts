import { z } from 'zod'

const id = z.string().min(1).max(200)
const finite = z.number().finite()
const time = finite.nonnegative()
const source = z.object({ path: z.string().min(1), playPath: z.string().min(1), hasAudio: z.boolean() }).passthrough()
const media = z.object({
  id, name: z.string(), kind: z.enum(['video', 'image', 'audio', 'text']),
  duration: time.nullable(), hue: finite,
  status: z.enum(['ready', 'importing', 'missing']).default('ready'), source: source.optional()
}).passthrough()
const clip = z.object({
  id, mediaId: id, trackId: id, start: time, sourceIn: time, sourceOut: time,
  speed: finite.positive(), reversed: z.boolean(), volume: finite.min(0).max(200),
  transform: z.object({ opacity: finite.min(0).max(100), scale: finite.positive(), x: finite, y: finite, rotation: finite }),
  fadeIn: time.optional(), fadeOut: time.optional(),
  transitionOut: z.object({ name: z.string(), duration: time }).optional(),
  effects: z.array(z.enum(['bw', 'warm', 'cool', 'contrast', 'vignette', 'blur'])).optional(),
  text: z.string().optional(), textColor: z.string().regex(/^#[a-f\d]{6}$/i).optional()
}).passthrough().refine(c => c.sourceOut > c.sourceIn, 'Tramo de fuente vacío o invertido')

export const projectDocumentSchema = z.object({
  name: z.string().max(200), media: z.array(media),
  sequence: z.object({
    id, name: z.string(), width: finite.int().positive().max(7680), height: finite.int().positive().max(4320),
    fps: z.object({ num: finite.positive(), den: finite.positive() }),
    sampleRate: finite.positive(), channels: finite.int().positive(),
    tracks: z.array(z.object({ id, name: z.string(), kind: z.enum(['visual', 'audio']), locked: z.boolean(), hidden: z.boolean(), muted: z.boolean() }).passthrough()),
    clips: z.array(clip)
  }).passthrough()
}).superRefine((doc, context) => {
  for (const items of [doc.media, doc.sequence.tracks, doc.sequence.clips]) {
    if (new Set(items.map(item => item.id)).size !== items.length) context.addIssue({ code: 'custom', message: 'Identificadores duplicados' })
  }
  const tracks = new Set(doc.sequence.tracks.map(t => t.id))
  for (const c of doc.sequence.clips) if (!tracks.has(c.trackId)) context.addIssue({ code: 'custom', message: 'Pista del clip inexistente' })
})
