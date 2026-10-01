import * as React from 'react'

import { cn } from '#/lib/utils'

// From the shadcn new-york-v4 registry, edited like input.tsx: a 44 px
// minimum height, the input token at full opacity, and the focus ring from the
// global :focus-visible rule in styles.css.
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-24 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'aria-invalid:border-2 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
