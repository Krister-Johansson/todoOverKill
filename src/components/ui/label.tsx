import * as React from 'react'
import { Label as LabelPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils'

// From the shadcn new-york-v4 registry. Labels wrap where the registry used
// leading-none, so long text stays readable at 400% zoom.
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
