import type { Bridge } from '../shared/contracts'

declare global {
  interface Window {
    /** Ausente fuera de Electron (pruebas unitarias, navegador). */
    wonderfilm?: Bridge
  }
}

export {}
