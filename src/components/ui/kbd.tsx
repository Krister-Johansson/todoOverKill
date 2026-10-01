import * as React from 'react'

import { cn } from '#/lib/utils'

// From the shadcn new-york-v4 registry, edited for docs/accessibility.md: the
// key cap is foreground text on muted (7:1 in both themes) with a border
// token for the cap's edge, a minimum size rather than a fixed height so it
// grows with text spacing (1.4.12), and the tooltip variants with opacity
// modifiers are gone. The text stays selectable.
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex min-h-6 w-fit min-w-6 items-center justify-center gap-1 rounded-sm border border-border bg-muted px-1.5 font-sans text-xs font-medium text-foreground',
        "[&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn('inline-flex flex-wrap items-center gap-1', className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
