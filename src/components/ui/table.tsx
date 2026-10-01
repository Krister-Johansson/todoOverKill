import * as React from 'react'

import { cn } from '#/lib/utils'

// From the shadcn new-york-v4 registry, edited for docs/accessibility.md:
// colours are full-opacity tokens (the registry's bg-muted/50 hover is gone,
// a static table does not need one), cells wrap instead of nowrap so a
// narrow table reflows at 320 px (1.4.10), and the caption sits above the
// table in foreground text. The container still scrolls for wide tables. A
// table that can overflow passes tabIndex, role and aria-label to the
// container through containerProps, so the keyboard can scroll it.
function Table({
  className,
  containerProps,
  ...props
}: React.ComponentProps<'table'> & {
  containerProps?: React.ComponentProps<'div'>
}) {
  return (
    <div
      data-slot="table-container"
      {...containerProps}
      className={cn(
        'relative w-full overflow-x-auto',
        containerProps?.className,
      )}
    >
      <table
        data-slot="table"
        className={cn('w-full caption-top text-sm', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t bg-muted font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b data-[state=selected]:bg-muted', className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'px-2 py-2 text-left align-middle font-semibold text-foreground',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('p-2 align-middle', className)}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mb-2 text-left text-sm text-foreground', className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
