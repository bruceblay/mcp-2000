import { useState, useEffect, useCallback } from 'react'

interface UseChatPanelResizeOptions {
  minWidth?: number
  maxWidth?: number
  defaultWidth?: number
}

export function useChatPanelResize({
  minWidth = 300,
  maxWidth = 700,
  defaultWidth = 340,
}: UseChatPanelResizeOptions = {}) {
  const [chatWidth, setChatWidth] = useState(defaultWidth)
  const [isResizing, setIsResizing] = useState(false)

  const startResizing = useCallback(() => setIsResizing(true), [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      const newWidth = window.innerWidth - e.clientX
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setChatWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, minWidth, maxWidth])

  return { chatWidth, isResizing, startResizing }
}
