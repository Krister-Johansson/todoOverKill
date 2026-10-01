import { ChevronDownIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '#/lib/utils'

// From the shadcn new-york-v4 registry, edited like input.tsx: a 44 px
// target, the input token and the icon at full opacity, and the focus ring
// from the global :focus-visible rule in styles.css. A native select keeps
// the platform's keyboard and screen reader behaviour.
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <div
      data-slot="native-select-wrapper"
      className="relative w-full min-w-0 has-[select:disabled]:opacity-50"
    >
      <select
        data-slot="native-select"
        className={cn(
          'min-h-11 w-full min-w-0 appearance-none rounded-md border border-input bg-background py-1 pr-10 pl-3 text-base text-foreground disabled:pointer-events-none disabled:cursor-not-allowed md:text-sm',
          'aria-invalid:border-2 aria-invalid:border-destructive',
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        aria-hidden="true"
        data-slot="native-select-icon"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-foreground"
      />
    </div>
  )
}

function NativeSelectOption(props: React.ComponentProps<'option'>) {
  return <option data-slot="native-select-option" {...props} />
}

export { NativeSelect, NativeSelectOption }
