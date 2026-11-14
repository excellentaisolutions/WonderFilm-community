import { join, isAbsolute } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { registerIpc } from './ipc'
import { registerMediaProtocol, registerSchemePrivileges } from './media-protocol'
import { startAgentService } from './agent-service'
import { closeReversePreviews } from './reverse-preview'

registerSchemePrivileges()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0d0f13',
    title: 'WonderFilm',
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      offscreen: process.env.WONDERFILM_E2E_OFFSCREEN === '1',
      backgroundThrottling: process.env.WONDERFILM_E2E_BACKGROUND !== '1'
    }
  })
  if (process.env.WONDERFILM_E2E_OFFSCREEN === '1') {
    win.webContents.on('paint', () => {})
    win.webContents.setFrameRate(30)
  }

  win.once('ready-to-show', () => { if (process.env.WONDERFILM_E2E_BACKGROUND !== '1') win.show() })
  const agents = startAgentService(win)
  win.on('closed', () => agents.close())

  // Cualquier enlace externo se abre en el navegador del sistema, nunca dentro del editor.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  let closeApproved = false
  const confirmClose = (event: Electron.IpcMainEvent) => {
    if (event.sender !== win.webContents) return
    closeApproved = true
    win.close()
  }
  ipcMain.on('window:confirm-close', confirmClose)
  win.on('closed', () => ipcMain.removeListener('window:confirm-close', confirmClose))
  win.on('close', (event) => {
    if (closeApproved) return
    event.preventDefault()
    // El renderer también conoce el guardado en curso y los cambios más recientes.
    win.webContents.send('window:close-requested')
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  let startupProject = process.argv.find(arg => isAbsolute(arg) && arg.toLowerCase().endsWith('.wonderfilm')) ?? null
  ipcMain.handle('project:startup', () => { const path = startupProject; startupProject = null; return path })
  registerMediaProtocol()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') void closeReversePreviews().finally(() => app.quit())
})
