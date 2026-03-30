import { useEffect, useRef, useState } from 'react'

type ScrollPickerProps = {
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  label: string
}

const ITEM_HEIGHT = 44
const VISIBLE_ITEMS = 5
const PADDING_ITEMS = Math.floor(VISIBLE_ITEMS / 2)

const isFinePointer = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

export function ScrollPicker(props: ScrollPickerProps) {
  if (isFinePointer()) {
    return <DesktopDragNumber {...props} />
  }
  return <MobileWheelPicker {...props} />
}

// ── Desktop: drag vertically, scroll wheel, double-click to type ──

function DesktopDragNumber({ min, max, value, onChange, label }: ScrollPickerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const elRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  // Mouse wheel — needs non-passive listener to preventDefault
  useEffect(() => {
    const el = elRef.current
    if (!el || isEditing) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -1 : 1
      onChange(clamp(valueRef.current + delta))
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [isEditing, onChange, min, max])

  // Click + drag vertically
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isEditing) return
    e.preventDefault()
    const startY = e.clientY
    const startValue = valueRef.current

    const handleMove = (me: PointerEvent) => {
      const delta = startY - me.clientY
      onChange(clamp(startValue + Math.round(delta / 3)))
    }

    const handleUp = () => {
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }

    document.body.style.cursor = 'ns-resize'
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  // Double-click to type
  const startEditing = () => {
    setEditText(String(value))
    setIsEditing(true)
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const commitEdit = () => {
    const parsed = parseInt(editText, 10)
    if (!isNaN(parsed)) onChange(clamp(parsed))
    setIsEditing(false)
  }

  // Arrow keys
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(clamp(value + (e.shiftKey ? 10 : 1)))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(clamp(value - (e.shiftKey ? 10 : 1)))
    } else if (e.key === 'Enter') {
      startEditing()
    }
  }

  if (isEditing) {
    return (
      <label className="transport-field transport-field-inline">
        <span className="transport-label">{label}</span>
        <input
          ref={inputRef}
          type="number"
          className="scroll-picker-edit-input"
          min={min}
          max={max}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setIsEditing(false)
          }}
        />
      </label>
    )
  }

  return (
    <div
      ref={elRef}
      className="scroll-picker-drag transport-field transport-field-inline"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onDoubleClick={startEditing}
      onKeyDown={handleKeyDown}
    >
      <span className="transport-label">{label}</span>
      <span className="scroll-picker-drag-value">{value}</span>
    </div>
  )
}

// ── Mobile: bottom-sheet scroll wheel picker ──

function MobileWheelPicker({ min, max, value, onChange, label }: ScrollPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const wheelRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<number>(0)
  const count = max - min + 1

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const wheel = wheelRef.current
    if (!wheel) return
    requestAnimationFrame(() => {
      wheel.scrollTop = (value - min) * ITEM_HEIGHT
    })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const wheel = wheelRef.current
    if (!wheel) return

    const onScroll = () => {
      clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = window.setTimeout(() => {
        const index = Math.round(wheel.scrollTop / ITEM_HEIGHT)
        const clamped = Math.min(Math.max(0, index), count - 1)
        onChange(min + clamped)
      }, 80)
    }

    wheel.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      wheel.removeEventListener('scroll', onScroll)
      clearTimeout(scrollTimeoutRef.current)
    }
  }, [isOpen, min, count, onChange])

  const scrollToValue = (v: number) => {
    const wheel = wheelRef.current
    if (!wheel) return
    wheel.scrollTo({ top: (v - min) * ITEM_HEIGHT, behavior: 'smooth' })
  }

  const close = () => setIsOpen(false)

  return (
    <>
      <button
        type="button"
        className="scroll-picker-trigger transport-field transport-field-inline"
        onClick={() => setIsOpen(true)}
      >
        <span className="transport-label">{label}</span>
        <span className="scroll-picker-trigger-value">{value}</span>
      </button>

      {isOpen ? (
        <div className="scroll-picker-overlay" onClick={close}>
          <div className="scroll-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="scroll-picker-header">
              <span className="scroll-picker-title">{label}</span>
              <button type="button" className="scroll-picker-done" onClick={close}>
                Done
              </button>
            </div>
            <div className="scroll-picker-wheel-wrapper">
              <div className="scroll-picker-highlight" />
              <div className="scroll-picker-fade scroll-picker-fade--top" />
              <div className="scroll-picker-fade scroll-picker-fade--bottom" />
              <div
                ref={wheelRef}
                className="scroll-picker-wheel"
                style={{ height: VISIBLE_ITEMS * ITEM_HEIGHT }}
              >
                <div style={{ height: PADDING_ITEMS * ITEM_HEIGHT }} />
                {Array.from({ length: count }, (_, i) => {
                  const v = min + i
                  return (
                    <div
                      key={v}
                      className="scroll-picker-item"
                      style={{ height: ITEM_HEIGHT }}
                      onClick={() => scrollToValue(v)}
                    >
                      {v}
                    </div>
                  )
                })}
                <div style={{ height: PADDING_ITEMS * ITEM_HEIGHT }} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
