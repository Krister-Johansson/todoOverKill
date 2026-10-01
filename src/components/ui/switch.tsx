import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils'

// From the shadcn new-york-v4 registry, edited for docs/accessibility.md: the
// root is a 44 px target that draws the track inside it, the track and thumb
// use full-opacity tokens (background on input is 3.9:1 light and 4.2:1 dark,
// on primary 17:1 and 19:1, both checked by scripts/check-contrast.ts),
// disabled keeps its colours rather than dropping opacity, and the focus ring
// comes from the global :focus-visible rule in styles.css. The thumb's
// transition collapses with the data-motion rules there.
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'group inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      <span
        data-slot="switch-track"
        className="inline-flex h-6 w-10 items-center rounded-full bg-input p-0.5 group-data-[state=checked]:bg-primary"
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className="pointer-events-none block size-5 rounded-full bg-background transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
        />
      </span>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
