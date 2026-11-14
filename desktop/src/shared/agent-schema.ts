import { z } from 'zod'
const empty = z.object({}).strict()
const id = z.string().min(1).max(200)
const seconds = z.number().finite().min(0).max(86400)
const file = z.string().min(3).max(32767)
const dimensions = { width: z.number().int().min(64).max(7680).multipleOf(2), height: z.number().int().min(64).max(4320).multipleOf(2) }
const fps = z.object({ num: z.number().int().min(1).max(120000), den: z.number().int().min(1).max(1001) }).strict().refine(v => v.num / v.den >= 1 && v.num / v.den <= 120, 'FPS fuera de 1–120')
export const agentSchemas = {
  'capabilities.get': empty,
  'project.get': empty,
  'project.create': z.object({ name: z.string().min(1).max(200), ...dimensions, fps, discardChanges: z.boolean().default(false) }).strict(),
  'project.open': z.object({ path: file, discardChanges: z.boolean().default(false) }).strict(),
  'project.save': z.object({ path: file, overwrite: z.boolean().default(false) }).strict(),
  'project.configure': z.object({ name: z.string().min(1).max(200).optional(), width: dimensions.width.optional(), height: dimensions.height.optional(), fps: fps.optional(), magnetic: z.boolean().optional(), snapping: z.boolean().optional() }).strict(),
  'media.import': z.object({ paths: z.array(file).min(1).max(50) }).strict(),
  'media.remove': z.object({ mediaId: id }).strict(),
  'track.add': z.object({ kind: z.enum(['visual', 'audio']), name: z.string().min(1).max(100).optional() }).strict(),
  'track.update': z.object({ trackId: id, name: z.string().min(1).max(100).optional(), locked: z.boolean().optional(), hidden: z.boolean().optional(), muted: z.boolean().optional() }).strict(),
  'clip.add': z.object({ mediaId: id, trackId: id, at: seconds, sourceIn: seconds.default(0), duration: seconds.positive().optional() }).strict(),
  'title.add': z.object({ text: z.string().min(1).max(2000), trackId: id, at: seconds, duration: seconds.positive(), color: z.string().regex(/^#[a-f\d]{6}$/i).default('#ffffff') }).strict(),
  'clip.update': z.object({ clipId: id, volume: z.number().min(0).max(200).optional(), reversed: z.boolean().optional(), text: z.string().max(2000).optional(), textColor: z.string().regex(/^#[a-f\d]{6}$/i).optional(), effects: z.array(z.enum(['bw', 'warm', 'cool', 'contrast', 'vignette', 'blur'])).max(6).optional(), fadeIn: seconds.optional(), fadeOut: seconds.optional(), transform: z.object({ opacity: z.number().min(0).max(100), scale: z.number().min(1).max(1000), x: z.number().min(-10000).max(10000), y: z.number().min(-10000).max(10000), rotation: z.number().min(-360).max(360) }).strict().partial().optional() }).strict(),
  'clip.move': z.object({ clipId: id, trackId: id, at: seconds }).strict(),
  'clip.trim': z.object({ clipId: id, edge: z.enum(['start', 'end']), at: seconds }).strict(),
  'clip.split': z.object({ clipId: id, at: seconds }).strict(),
  'clip.speed': z.object({ clipId: id, speed: z.number().min(.1).max(10) }).strict(),
  'clip.transition': z.object({ clipId: id, name: z.enum(['Fundido cruzado', 'Fundido a negro', 'Barrido lateral', 'Zoom suave', 'Deslizar arriba', 'Desenfoque']).nullable() }).strict(),
  'clips.delete': z.object({ clipIds: z.array(id).min(1).max(500), ripple: z.boolean().default(false) }).strict(),
  'clips.duplicate': z.object({ clipIds: z.array(id).min(1).max(500) }).strict(),
  'clips.group': z.object({ clipIds: z.array(id).min(1).max(500), ungroup: z.boolean().default(false) }).strict(),
  'track.closeGaps': z.object({ trackId: id }).strict(),
  'history.undo': empty, 'history.redo': empty,
  'playback.set': z.object({ at: seconds.optional(), playing: z.boolean().optional() }).strict(),
  'export.start': z.object({ path: file, format: z.enum(['mp4', 'mp4-hevc', 'mov-prores', 'webm', 'gif', 'mp3']), quality: z.enum(['low', 'medium', 'high', 'max']).default('high'), useGpu: z.boolean().default(true), overwrite: z.boolean().default(false) }).strict(),
  'frame.capture': z.object({ at: seconds, name: z.string().min(1).max(100) }).strict(),
  'jobs.status': z.object({ jobId: z.string().uuid() }).strict(),
  'jobs.cancel': z.object({ jobId: z.string().uuid() }).strict()
}
export type AgentMethod = keyof typeof agentSchemas
export interface AgentCommand { id: string; method: AgentMethod; params: unknown }
export interface AgentStatus { enabled: boolean; busy: boolean; activity: { at: string; client: string; method: string; status: string }[]; jobs: { id: string; status: string; progress: number; error?: string }[]; mcp: unknown }
