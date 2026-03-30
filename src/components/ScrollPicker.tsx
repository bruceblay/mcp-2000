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

export function ScrollPicker({ min, max, value, onChange, label }: ScrollPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const wheelRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<number>(0)
  const count = max - min + 1

  // Prevent body scroll while open
  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Scroll to current value when opening
  useEffect(() => {
    if (!isOpen) return
    const wheel = wheelRef.current
    if (!wheel) return
    // RAF ensures layout is complete before setting scroll position
    requestAnimationFrame(() => {
      wheel.scrollTop = (value - min) * ITEM_HEIGHT
    })
  }, [isOpen])

  // Listen for scroll to update selected value
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
