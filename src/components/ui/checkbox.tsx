import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { CheckIcon } from 'lucide-react'

import { cn } from '#/lib/utils'

// From the shadcn new-york-v4 registry, edited for docs/accessibility.md as
// the Switch is: the root is a 44 px target that draws a 20 px box inside it,
// the box uses full-opacity tokens (its input border on background is 3.9:1
// light and 4.2:1 dark, primary on background 17:1 and 19:1, both checked by
// scripts/check-contrast.ts), the tick is primary-foreground on primary,
// disabled keeps its colours rather than dropping opacity, and the focus ring
// comes from the global :focus-visible rule in styles.css.
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'group inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      <span
        data-slot="checkbox-box"
        className="inline-flex size-5 items-center justify-center rounded-sm border-2 border-input bg-background group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary"
      >
        <CheckboxPrimitive.Indicator
          data-slot="checkbox-indicator"
          className="flex items-center justify-center text-primary-foreground"
        >
          <CheckIcon aria-hidden="true" className="size-4" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
