import { useId, useState } from 'react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { PRIORITY_DISPLAY } from '#/lib/priority'
import { filterAnnouncement, hasActiveFilters } from '#/lib/task-filter'
import { dueFilterSchema, taskPrioritySchema } from '#/schemas/task'

import type { TaskFilters } from '#/lib/task-filter'

const DUE_OPTIONS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Due this week' },
] as const

/**
 * The board and list filters. It holds no router: the route passes the
 * filters from its URL and navigates in `onChange` and `onClear`. A select
 * applies at once (3.2.5 allows a change on selection when it does not move
 * focus or open anything); the text applies on Enter or Apply, so the URL
 * does not change per keystroke.
 */
export function TaskFilterBar({
  filters,
  statuses,
  labels,
  shown,
  total,
  onChange,
  onClear,
}: {
  filters: TaskFilters
  statuses: ReadonlyArray<{ id: string; name: string }>
  labels: ReadonlyArray<{ id: string; name: string }>
  shown: number
  total: number
  onChange: (next: TaskFilters) => void
  onClear: () => void
}) {
  const id = useId()
  const fieldId = (name: string) => `${id}-${name}`
  const active = hasActiveFilters(filters)

  // The typed text, reset when the URL's text changes (Clear, Back, or a
  // reload), so the field never shows text that is not applied.
  const [text, setText] = useState(filters.q ?? '')
  const [appliedText, setAppliedText] = useState(filters.q)
  if (appliedText !== filters.q) {
    setAppliedText(filters.q)
    setText(filters.q ?? '')
  }

  function change(patch: Partial<TaskFilters>) {
    onChange({ ...filters, ...patch })
  }

  return (
    <form
      aria-label="Filter tasks"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        change({ q: text.trim() || undefined })
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-44">
          <Label htmlFor={fieldId('status')}>Status</Label>
          <NativeSelect
            id={fieldId('status')}
            value={filters.status ?? ''}
            onChange={(event) =>
              change({ status: event.target.value || undefined })
            }
          >
            <NativeSelectOption value="">Any status</NativeSelectOption>
            {statuses.map((status) => (
              <NativeSelectOption key={status.id} value={status.id}>
                {status.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-44">
          <Label htmlFor={fieldId('priority')}>Priority</Label>
          <NativeSelect
            id={fieldId('priority')}
            value={filters.priority ?? ''}
            onChange={(event) => {
              const parsed = taskPrioritySchema.safeParse(event.target.value)
              change({ priority: parsed.success ? parsed.data : undefined })
            }}
          >
            <NativeSelectOption value="">Any priority</NativeSelectOption>
            {taskPrioritySchema.options.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {PRIORITY_DISPLAY[value].label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {labels.length > 0 ? (
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-44">
            <Label htmlFor={fieldId('label')}>Label</Label>
            <NativeSelect
              id={fieldId('label')}
              value={filters.label ?? ''}
              onChange={(event) =>
                change({ label: event.target.value || undefined })
              }
            >
              <NativeSelectOption value="">Any label</NativeSelectOption>
              {labels.map((label) => (
                <NativeSelectOption key={label.id} value={label.id}>
                  {label.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-44">
          <Label htmlFor={fieldId('due')}>Due</Label>
          <NativeSelect
            id={fieldId('due')}
            value={filters.due ?? ''}
            onChange={(event) => {
              const parsed = dueFilterSchema.safeParse(event.target.value)
              change({ due: parsed.success ? parsed.data : undefined })
            }}
          >
            <NativeSelectOption value="">Any time</NativeSelectOption>
            {DUE_OPTIONS.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-72">
          <Label htmlFor={fieldId('q')}>Text</Label>
          <div className="flex min-w-0 gap-2">
            <Input
              id={fieldId('q')}
              type="search"
              value={text}
              maxLength={200}
              onChange={(event) => setText(event.target.value)}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="outline">
              Apply
            </Button>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-disabled={!active}
          className="aria-disabled:cursor-not-allowed"
          onClick={() => {
            if (active) onClear()
          }}
        >
          Clear filters
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {filterAnnouncement(shown, total)}
      </p>
    </form>
  )
}
