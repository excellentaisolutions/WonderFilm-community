/** Operaciones cortas no muestran aviso; las ráfagas largas mantienen uno estable. */
export function activityIndicator(show: (visible: boolean) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let visible = false
  return {
    update(busy: boolean) {
      clearTimeout(timer)
      if (busy === visible) return
      timer = setTimeout(() => { visible = busy; show(visible) }, busy ? 350 : 650)
    },
    dispose() { clearTimeout(timer) }
  }
}
