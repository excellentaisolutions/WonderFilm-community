import { contextBridge, ipcRenderer, webUtils } from 'electron'

type Listener<T> = (payload: T) => void

function subscribe<T>(channel: string, fn: Listener<T>): () => void {
  const handler = (_e: unknown, payload: T) => fn(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  reversePreview: (path: string, from: number, to: number) => ipcRenderer.invoke('media:reverse-preview', { path, from, to }),
  takeStartupProject: () => ipcRenderer.invoke('project:startup'),
  onCloseRequested: (fn: () => void) => subscribe('window:close-requested', fn),
  confirmClose: () => ipcRenderer.send('window:confirm-close'),
  agentStatus: () => ipcRenderer.invoke('agent:status'),
  agentEnable: (enabled: boolean) => ipcRenderer.invoke('agent:enable', enabled),
  agentRevoke: () => ipcRenderer.invoke('agent:revoke'),
  onAgentState: (fn: Listener<unknown>) => subscribe('agent:state', fn),
  onAgentCommand: (fn: Listener<unknown>) => subscribe('agent:command', fn),
  agentReply: (value: unknown) => ipcRenderer.send('agent:reply', value),
  agentProgress: (value: number) => ipcRenderer.send('agent:progress', value),
  platform: process.platform,
  importMedia: (paths?: string[]) => ipcRenderer.invoke('media:import', paths),
  relinkMedia: (id: string, name: string) => ipcRenderer.invoke('media:relink', { id, name }),
  onMediaEvent: (fn: Listener<unknown>) => subscribe('media:event', fn),
  /** Ruta real de un fichero soltado desde el explorador (File.path ya no existe). */
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  saveProject: (doc: unknown, path: string | null, saveAs: boolean) => ipcRenderer.invoke('project:save', { doc, path, saveAs }),
  openProject: (path?: string) => ipcRenderer.invoke('project:open', path),
  recentProjects: () => ipcRenderer.invoke('project:recents'),
  setDirty: (dirty: boolean) => ipcRenderer.invoke('project:dirty', dirty),
  chooseExportPath: (name: string, format: string) => ipcRenderer.invoke('export:choose', { name, format }),
  startExport: (req: unknown) => ipcRenderer.invoke('export:start', req),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  onExportProgress: (fn: Listener<number>) => subscribe('export:progress', fn),
  reveal: (path: string) => ipcRenderer.invoke('shell:reveal', path),
  captureFrame: (req: unknown) => ipcRenderer.invoke('frame:capture', req),
  exportHardware: () => ipcRenderer.invoke('export:hardware')
}

contextBridge.exposeInMainWorld('wonderfilm', api)

export type WonderFilmApi = typeof api
