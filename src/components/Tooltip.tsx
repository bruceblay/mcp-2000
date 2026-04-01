import * as TooltipPrimitive from '@radix-ui/react-tooltip'

export const TooltipProvider = TooltipPrimitive.Provider

export const Tooltip = ({
  children,
  label,
  side = 'top',
  sideOffset = 6,
}: {
  children: React.ReactNode
  label: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
}) => (
  <TooltipPrimitive.Root delayDuration={400}>
    <TooltipPrimitive.Trigger asChild>
      {children}
    </TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className="tooltip-content"
        side={side}
        sideOffset={sideOffset}
      >
        {label}
        <TooltipPrimitive.Arrow className="tooltip-arrow" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
)
