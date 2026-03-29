import { useRef, useCallback } from 'react'

type KnobProps = {
  value: number
  min: number
  max: number
  step: number
  label: string
  compact?: boolean
  bipolar?: boolean
  formatValue?: (value: number) => string
  onChange: (value: number) => void
}

const SWEEP_DEGREES = 270
const START_ANGLE = 135
const DRAG_SENSITIVITY = 150

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

const describeArc = (cx: number, cy: number, r: number, startDeg: number, endDeg: number) => {
  if (Math.abs(endDeg - startDeg) < 0.5) return ''
  const lo = Math.min(startDeg, endDeg)
  const hi = Math.max(startDeg, endDeg)
  const start = polarToCartesian(cx, cy, r, hi)
  const end = polarToCartesian(cx, cy, r, lo)
  const largeArc = hi - lo > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

export function Knob({ value, min, max, step, label, compact, bipolar, formatValue, onChange }: KnobProps) {
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null)

  const snap = useCallback(
    (v: number) => {
      const snapped = Math.round(v / step) * step
      return Math.min(max, Math.max(min, Number(snapped.toFixed(10))))
    },
    [min, max, step],
  )

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startValue: value }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const deltaY = dragRef.current.startY - e.clientY
    const range = max - min
    const next = dragRef.current.startValue + (deltaY / DRAG_SENSITIVITY) * range
    onChange(snap(next))
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  const fraction = (value - min) / (max - min)
  const valueAngle = START_ANGLE + fraction * SWEEP_DEGREES
  const endAngle = START_ANGLE + SWEEP_DEGREES
  const centerAngle = START_ANGLE + SWEEP_DEGREES / 2

  const cx = 20
  const cy = 20
  const r = 15

  const pointer = polarToCartesian(cx, cy, r - 4, valueAngle)
  const pointerInner = polarToCartesian(cx, cy, r - 9, valueAngle)

  const displayValue = formatValue ? formatValue(value) : String(value)

  return (
    <div className={compact ? 'knob knob-compact' : 'knob'}>
      <svg
        className="knob-svg"
        viewBox="0 0 40 40"
        style={bipolar ? { transform: 'rotate(90deg)' } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <path
          d={describeArc(cx, cy, r, START_ANGLE, endAngle)}
          fill="none"
          stroke="var(--lcd-border)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {bipolar ? (
          valueAngle !== centerAngle ? (
            <path
              d={valueAngle > centerAngle
                ? describeArc(cx, cy, r, centerAngle, valueAngle)
                : describeArc(cx, cy, r, valueAngle, centerAngle)}
              fill="none"
              stroke="var(--lcd-text)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ) : null
        ) : (
          fraction > 0.005 ? (
            <path
              d={describeArc(cx, cy, r, START_ANGLE, valueAngle)}
              fill="none"
              stroke="var(--lcd-text)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ) : null
        )}
        <line
          x1={pointerInner.x}
          y1={pointerInner.y}
          x2={pointer.x}
          y2={pointer.y}
          stroke="var(--lcd-text)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="knob-label">{label}</span>
      <span className="knob-value">{displayValue}</span>
    </div>
  )
}
