import { useState, useCallback, useRef } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastData {
  id: number
  type: ToastType
  title: string
  message?: string
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const counter = useRef(0)

  const showToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++counter.current
    setToasts(prev => [...prev, { id, type, title, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, showToast, dismissToast }
}
