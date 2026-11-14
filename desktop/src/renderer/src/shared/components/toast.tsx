import { useEffect } from 'react'
import { useEditor } from '@/features/editor/store/editor-store'

export function Toast() {
  const toast = useEditor((s) => s.toast)
  const showToast = useEditor((s) => s.showToast)
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => showToast(null), 2800)
    return () => window.clearTimeout(id)
  }, [toast, showToast])
  if (!toast) return null
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-line bg-raised px-4 py-2 text-sm shadow-xl">
      {toast}
    </div>
  )
}
