import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useEditor } from './editor-store'
import { dismissProjectDecision, useProjectDecision } from '@/features/project/store/project-decision'

const settings = { name: 'Original', width: 640, height: 360, fps: { num: 25, den: 1 } }
const setDirty = vi.fn().mockResolvedValue(undefined)
const saveProject = vi.fn()
const openProject = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  dismissProjectDecision()
  useEditor.setState(useEditor.getInitialState(), true)
  vi.stubGlobal('window', { wonderfilm: { setDirty, saveProject, openProject } })
  useEditor.getState().createProject(settings)
})
afterEach(() => vi.unstubAllGlobals())

describe('Conservación del proyecto activo', () => {
  it('cancelar un proyecto nuevo conserva nombre, secuencia e historial', () => {
    useEditor.getState().setProjectName('Trabajo sin guardar')
    const before = useEditor.getState()
    useEditor.getState().createProject({ ...settings, name: 'Sustituto' })
    expect(useProjectDecision.getState().pending?.kind).toBe('replace')
    dismissProjectDecision()
    expect(useEditor.getState().projectName).toBe('Trabajo sin guardar')
    expect(useEditor.getState().sequence).toBe(before.sequence)
    expect(useEditor.getState().dirty).toBe(true)
  })
  it('aceptar descartar permite reemplazar por un ejemplo', () => {
    useEditor.getState().setProjectName('Pendiente')
    useEditor.getState().openProject('empty')
    const pending = useProjectDecision.getState().pending!
    expect(pending.kind).toBe('replace')
    dismissProjectDecision()
    pending.proceed()
    expect(useEditor.getState().projectName).not.toBe('Pendiente')
    expect(useEditor.getState().dirty).toBe(false)
  })
  it('cancelar la sustitución por un archivo conserva el proyecto', async () => {
    const state = useEditor.getState()
    openProject.mockResolvedValue({ path: 'otro.wonderfilm', doc: { name: 'Otro', media: [], sequence: state.sequence } })
    state.setProjectName('Pendiente')
    await useEditor.getState().openProjectFile('otro.wonderfilm')
    expect(useProjectDecision.getState().pending?.kind).toBe('replace')
    dismissProjectDecision()
    expect(useEditor.getState().projectName).toBe('Pendiente')
    expect(useEditor.getState().projectPath).toBeNull()
  })
  it('una confirmación antigua no sustituye otra sesión de proyecto', () => {
    useEditor.getState().setProjectName('Pendiente')
    useEditor.getState().createProject({ ...settings, name: 'Solicitud antigua' })
    const pending = useProjectDecision.getState().pending!
    useEditor.getState().createProject({ ...settings, name: 'Sesión nueva' }, true)
    dismissProjectDecision()
    pending.proceed()
    expect(useEditor.getState().projectName).toBe('Sesión nueva')
  })
  it('un archivo inválido no pide descartar ni altera el documento', async () => {
    useEditor.getState().setProjectName('Pendiente')
    openProject.mockResolvedValue({ error: 'Archivo inválido' })
    await useEditor.getState().openProjectFile('invalid.wonderfilm')
    expect(useProjectDecision.getState().pending).toBeNull()
    expect(useEditor.getState().projectName).toBe('Pendiente')
    expect(useEditor.getState().dirty).toBe(true)
  })
  it('una edición durante el guardado permanece pendiente', async () => {
    let finish!: (path: string) => void
    saveProject.mockImplementation(() => new Promise<string>(resolve => { finish = resolve }))
    useEditor.getState().setProjectName('Versión que se guarda')
    const saving = useEditor.getState().saveProject()
    useEditor.getState().setProjectName('Edición posterior')
    finish('original.wonderfilm')
    await saving
    expect(useEditor.getState().projectName).toBe('Edición posterior')
    expect(useEditor.getState().dirty).toBe(true)
    expect(setDirty).toHaveBeenLastCalledWith(true)
  })
  it('un guardado tardío no asigna su ruta a otro proyecto', async () => {
    let finish!: (path: string) => void
    saveProject.mockImplementation(() => new Promise<string>(resolve => { finish = resolve }))
    const saving = useEditor.getState().saveProject()
    useEditor.getState().createProject({ ...settings, name: 'Nuevo independiente' })
    finish('anterior.wonderfilm')
    await saving
    expect(useEditor.getState().projectName).toBe('Nuevo independiente')
    expect(useEditor.getState().projectPath).toBeNull()
  })
  it('cancelar Guardar como conserva los cambios pendientes', async () => {
    useEditor.getState().setProjectName('Pendiente')
    saveProject.mockResolvedValue(null)
    expect(await useEditor.getState().saveProject(true)).toBe(false)
    expect(useEditor.getState().dirty).toBe(true)
    expect(useEditor.getState().projectPath).toBeNull()
    expect(useEditor.getState().saving).toBe(false)
  })
  it('un error de escritura permite reintentar y conserva el proyecto', async () => {
    useEditor.getState().setProjectName('Pendiente')
    saveProject.mockRejectedValueOnce(new Error('Disco lleno'))
    expect(await useEditor.getState().saveProject()).toBe(false)
    expect(useEditor.getState().dirty).toBe(true)
    expect(useEditor.getState().toast).toContain('Disco lleno')
    saveProject.mockResolvedValueOnce('recuperado.wonderfilm')
    expect(await useEditor.getState().saveProject()).toBe(true)
    expect(useEditor.getState().dirty).toBe(false)
  })
  it('no abre un segundo guardado mientras el primero espera', async () => {
    let finish!: (path: string) => void
    saveProject.mockImplementation(() => new Promise<string>(resolve => { finish = resolve }))
    const first = useEditor.getState().saveProject()
    expect(await useEditor.getState().saveProject(true)).toBe(false)
    expect(saveProject).toHaveBeenCalledOnce()
    finish('original.wonderfilm')
    await first
    expect(useEditor.getState().saving).toBe(false)
  })
})
