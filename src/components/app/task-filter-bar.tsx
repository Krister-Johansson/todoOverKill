import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { PRIORITY_DISPLAY } from '#/lib/priority'
import { filterAnnouncement } from '#/lib/task-filter'
import { dueFilterSchema, taskPrioritySchema } from '#/schemas/task'

import type { Ref } from 'react'
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
 * does not change per keystroke. Emptying the field with Escape or its clear
 * control removes the text filter at once.
 *
 * `filters` are the resolved filters the controls show; `active` says whether
 * the URL holds any filter param, including a stale status or label the
 * controls cannot show, so Clear filters can still remove it. The results
 * line takes `resultsRef` and can hold focus, so the board can send focus
 * there when a card leaves the filter.
 */
export function TaskFilterBar({
  filters,
  active,
  statuses,
  labels,
  shown,
  total,
  onChange,
  onClear,
  resultsRef,
}: {
  filters: TaskFilters
  active: boolean
  statuses: ReadonlyArray<{ id: string; name: string }>
  labels: ReadonlyArray<{ id: string; name: string }>
  shown: number
  total: number
  onChange: (next: TaskFilters) => void
  onClear: () => void
  resultsRef?: Ref<HTMLParagraphElement>
}) {
  const id = useId()
  const fieldId = (name: string) => `${id}-${name}`

  // The typed text, reset when the URL's text changes (Clear, Back, or a
  // reload), so the field never shows text that is not applied.
  const [text, setText] = useState(filters.q ?? '')
  const [appliedText, setAppliedText] = useState(filters.q)
  if (appliedText !== filters.q) {
    setAppliedText(filters.q)
    setText(filters.q ?? '')
  }
  const clearable = active || text !== ''

  // Every applied change resets the field to the text it applies, so typed
  // text that was never applied does not linger beside other filters.
  function change(patch: Partial<TaskFilters>) {
    const next = { ...filters, ...patch }
    setText(next.q ?? '')
    onChange(next)
  }

  // Escape and the field's clear control empty a search field and fire
  // `search`, which React has no prop for. An empty field then means no text
  // filter, as it does after Apply.
  const textRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const input = textRef.current
    if (!input) return
    const onSearch = () => {
      if (input.value !== '' || filters.q === undefined) return
      setText('')
      onChange({ ...filters, q: undefined })
    }
    input.addEventListener('search', onSearch)
    return () => input.removeEventListener('search', onSearch)
  }, [filters, onChange])

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
              ref={textRef}
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
          aria-disabled={!clearable}
          className="aria-disabled:cursor-not-allowed"
          onClick={() => {
            setText('')
            if (active) onClear()
          }}
        >
          Clear filters
        </Button>
      </div>
      <p
        ref={resultsRef}
        tabIndex={-1}
        className="self-start text-sm text-muted-foreground"
      >
        {filterAnnouncement(shown, total)}
      </p>
    </form>
  )
}
