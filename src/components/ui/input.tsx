import * as React from 'react'

import { cn } from '#/lib/utils'

// From the shadcn new-york-v4 registry, edited for docs/accessibility.md: a
// 44 px target, the input token at full opacity, and the focus ring from the
// global :focus-visible rule in styles.css.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base text-foreground selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'aria-invalid:border-2 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
