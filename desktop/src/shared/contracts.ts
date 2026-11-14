import type { MediaItem, Sequence } from '../renderer/src/features/timeline/model/types'
import type { ExportFormat, ExportQuality } from './export-graph'
import type { AgentCommand, AgentStatus } from './agent-schema'

export interface ProjectDocument {
  name: string
  media: MediaItem[]
  sequence: Sequence
}

export interface RecentEntry {
  path: string
  name: string
  openedAt: string
  durationLabel: string
  resolution: string
  hue: number
  exists?: boolean
  thumbPath?: string
}

export type OpenResult = { path: string; doc: ProjectDocument } | { error: string } | null

export interface ExportRequest {
  sequence: Sequence
  media: MediaItem[]
  format: ExportFormat
  quality: ExportQuality
  output: string
  frameAt?: number
  /** Usar la tarjeta grafica si hay codificador. Por defecto, si. */
  useGpu?: boolean
}

export type ExportOutcome =
  | { ok: true; output: string; bytes: number; seconds: number }
  | { ok: false; cancelled?: boolean; message: string; detail?: string }

export type MediaEvent =
  | { type: 'added'; item: MediaItem }
  | { type: 'updated'; id: string; patch: Partial<MediaItem> }
  | { type: 'failed'; name: string; message: string }

/** Lo que el preload expone en `window.wonderfilm`. */
export interface Bridge {
  reversePreview: (path: string, from: number, to: number) => Promise<{ path?: string; error?: string }>
  takeStartupProject: () => Promise<string | null>
  onCloseRequested: (fn: () => void) => () => void
  confirmClose: () => void
  agentStatus: () => Promise<AgentStatus>
  agentEnable: (enabled: boolean) => Promise<AgentStatus>
  agentRevoke: () => Promise<AgentStatus>
  onAgentState: (fn: (state: AgentStatus) => void) => () => void
  onAgentCommand: (fn: (command: AgentCommand) => void) => () => void
  agentReply: (value: { id: string; result?: unknown; error?: string }) => void
  agentProgress: (value: number) => void
  platform: string
  importMedia: (paths?: string[]) => Promise<number>
  relinkMedia: (id: string, name: string) => Promise<boolean>
  onMediaEvent: (fn: (e: MediaEvent) => void) => () => void
  pathForFile: (file: File) => string
  saveProject: (doc: ProjectDocument, path: string | null, saveAs: boolean) => Promise<string | null>
  openProject: (path?: string) => Promise<OpenResult>
  recentProjects: () => Promise<RecentEntry[]>
  setDirty: (dirty: boolean) => Promise<void>
  chooseExportPath: (name: string, format: ExportFormat) => Promise<string | null>
  startExport: (req: ExportRequest) => Promise<ExportOutcome>
  cancelExport: () => Promise<void>
  onExportProgress: (fn: (fraction: number) => void) => () => void
  reveal: (path: string) => Promise<void>
  /** Nombre de la GPU que puede codificar ("NVIDIA", "Intel", "AMD") o null. */
  exportHardware: () => Promise<string | null>
  captureFrame: (req: { sequence: Sequence; media: MediaItem[]; at: number; name: string }) => Promise<ExportOutcome>
}

/** URL de un fichero local para `<video>`, `<img>` o `fetch`. El main decide si la sirve. */
export function mediaUrl(path: string): string {
  return `wf-media://local/${encodeURIComponent(path)}`
}
