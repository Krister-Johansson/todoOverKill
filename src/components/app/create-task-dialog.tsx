import { useForm, useStore } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { Textarea } from '#/components/ui/textarea'
import { createTaskFn, tasksQueryOptions } from '#/fns/tasks'
import { useHotkeys } from '#/hooks/use-hotkeys'
import { PRIORITY_DISPLAY } from '#/lib/priority'
import { createTaskFormSchema, toCreateTaskInput } from '#/schemas/task'

import { useAnnounce } from './live-region'
import { taskCardId } from './task-card'

import type { Priority } from '#/generated/prisma/enums'
import type { CreateTaskResult } from '#/fns/tasks'
import type { CreateTaskFormValues, CreateTaskInput } from '#/schemas/task'

type TaskProject = {
  id: string
  key: string
  name: string
  statuses: Array<{ id: string; name: string }>
}

const FIELDS = [
  { name: 'title', label: 'Title' },
  { name: 'description', label: 'Description' },
  { name: 'dueDate', label: 'Due date' },
] as const

const PRIORITIES = Object.entries(PRIORITY_DISPLAY) as Array<
  [Priority, (typeof PRIORITY_DISPLAY)[Priority]]
>

const GENERIC_ERROR = 'Could not create the task. Try again.'

/** Frames to wait for the new card before focus falls back to the trigger. */
const FOCUS_ATTEMPTS = 10

/** Field errors are strings or Standard Schema issues, depending on the source. */
function errorText(errors: Array<unknown>) {
  for (const error of errors) {
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message)
    }
  }
  return undefined
}

/**
 * The "New task" button and its dialog, for the project of the current route,
 * which the form never asks for (3.3.7). `c` opens it too, through
 * useHotkeys. Errors show under each field and in a summary at the top that
 * takes focus (3.3.1, 3.3.3); a server problem shows in the same summary.
 * After a create the task joins the board's cache, the live region announces
 * it, and focus moves to its card, or to the button on a page without cards
 * (2.4.3). Escape and Cancel return focus to the button.
 */
export function CreateTaskDialog({ project }: { project: TaskProject }) {
  const announce = useAnnounce()
  const queryClient = useQueryClient()
  const id = useId()
  const fieldId = (name: string) => `${id}-${name}`
  const errorId = (name: string) => `${id}-${name}-error`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const createdId = useRef<string | null>(null)
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // Bumped to move focus to the summary once it has rendered.
  const [summaryFocus, setSummaryFocus] = useState(0)

  useEffect(() => {
    if (summaryFocus > 0) summaryRef.current?.focus()
  }, [summaryFocus])

  const mutation = useMutation({
    mutationFn: (data: CreateTaskInput) =>
      createTaskFn({ data: { projectId: project.id, data } }),
  })

  const defaultValues: CreateTaskFormValues = {
    title: '',
    description: '',
    statusId: project.statuses[0]?.id ?? '',
    priority: 'none',
    dueDate: '',
  }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: createTaskFormSchema },
    onSubmitInvalid: () => setSummaryFocus((count) => count + 1),
    onSubmit: async ({ value }) => {
      setFormError(null)
      let result: CreateTaskResult
      try {
        result = await mutation.mutateAsync(toCreateTaskInput(value))
      } catch {
        setFormError(GENERIC_ERROR)
        setSummaryFocus((count) => count + 1)
        return
      }
      if (!result.ok) {
        setFormError(result.message)
        setSummaryFocus((count) => count + 1)
        return
      }
      const { task } = result
      const { queryKey } = tasksQueryOptions(project.id)
      // The new task has the highest order in its status, so it goes last.
      // The refetch brings the server's order without waiting for it here.
      queryClient.setQueryData(queryKey, (tasks) =>
        tasks ? [...tasks, task] : tasks,
      )
      void queryClient.invalidateQueries({ queryKey })
      createdId.current = task.id
      announce(`Task ${project.key}-${task.number} created`)
      setOpen(false)
    },
  })

  const fieldMeta = useStore(form.store, (state) => state.fieldMeta)
  const attempted = useStore(
    form.store,
    (state) => state.submissionAttempts > 0,
  )
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting)
  const fieldErrors = FIELDS.flatMap(({ name, label }) => {
    const message = errorText(fieldMeta[name]?.errors ?? [])
    return message ? [{ name, label, message }] : []
  })
  const showSummary = (attempted && fieldErrors.length > 0) || !!formError

  function handleOpenChange(next: boolean) {
    if (next) {
      form.reset()
      createdId.current = null
      setFormError(null)
    }
    setOpen(next)
  }

  useHotkeys({ c: () => handleOpenChange(true) })

  /**
   * Focuses the new card. The board renders it after the cache update, so it
   * may be a frame or two late; a project page without a board has none.
   */
  function focusCreated(taskId: string, attempts = FOCUS_ATTEMPTS) {
    const card = document.getElementById(taskCardId(taskId))
    if (card) card.focus()
    else if (attempts > 0) {
      requestAnimationFrame(() => focusCreated(taskId, attempts - 1))
    } else triggerRef.current?.focus()
  }

  function describedBy(name: string, help?: string) {
    const ids = [
      help,
      errorText(fieldMeta[name as 'title']?.errors ?? []) && errorId(name),
    ]
    return ids.filter(Boolean).join(' ') || undefined
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button ref={triggerRef} variant="outline">
          <Plus aria-hidden="true" />
          New task
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => {
          // Escape and Cancel leave Radix to return focus to the trigger. A
          // create takes over first, so Radix does not refocus the trigger
          // after the card has focus.
          const taskId = createdId.current
          if (!taskId) return
          event.preventDefault()
          createdId.current = null
          focusCreated(taskId)
        }}
      >
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Add a task to {project.name}. Only the title is required.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!isSubmitting) void form.handleSubmit()
          }}
        >
          {showSummary && (
            <div
              ref={summaryRef}
              tabIndex={-1}
              aria-labelledby={`${id}-summary-title`}
              className="flex flex-col gap-2 rounded-md border-2 border-destructive p-3"
            >
              <h3 id={`${id}-summary-title`} className="font-semibold">
                {fieldErrors.length > 0
                  ? 'Fix these fields'
                  : 'There is a problem'}
              </h3>
              {formError && <p className="text-sm">{formError}</p>}
              {fieldErrors.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {fieldErrors.map(({ name, label, message }) => (
                    <li key={name}>
                      <a
                        href={`#${fieldId(name)}`}
                        className="inline-flex min-h-11 items-center text-destructive underline underline-offset-4"
                        onClick={(event) => {
                          event.preventDefault()
                          document.getElementById(fieldId(name))?.focus()
                        }}
                      >
                        {label}: {message}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <form.Field name="title">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={fieldId('title')}>Title (required)</Label>
                <Input
                  id={fieldId('title')}
                  name="title"
                  autoComplete="off"
                  aria-required="true"
                  aria-invalid={
                    errorText(field.state.meta.errors) ? true : undefined
                  }
                  aria-describedby={describedBy('title')}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError
                  id={errorId('title')}
                  message={errorText(field.state.meta.errors)}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={fieldId('description')}>Description</Label>
                <Textarea
                  id={fieldId('description')}
                  name="description"
                  aria-invalid={
                    errorText(field.state.meta.errors) ? true : undefined
                  }
                  aria-describedby={describedBy('description')}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError
                  id={errorId('description')}
                  message={errorText(field.state.meta.errors)}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="statusId">
            {(field) =>
              project.statuses.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={fieldId('statusId')}>Status</Label>
                  <NativeSelect
                    id={fieldId('statusId')}
                    name="statusId"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  >
                    {project.statuses.map((status) => (
                      <NativeSelectOption key={status.id} value={status.id}>
                        {status.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              ) : (
                <p className="text-sm">
                  This project has no statuses, so the task cannot be placed.
                </p>
              )
            }
          </form.Field>

          <form.Field name="priority">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={fieldId('priority')}>Priority</Label>
                <NativeSelect
                  id={fieldId('priority')}
                  name="priority"
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(event.target.value as Priority)
                  }
                >
                  {PRIORITIES.map(([value, { label }]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
          </form.Field>

          <form.Field name="dueDate">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={fieldId('dueDate')}>Due date</Label>
                <p
                  id={`${id}-dueDate-help`}
                  className="text-sm text-muted-foreground"
                >
                  Optional. A calendar day, such as 2026-10-01.
                </p>
                <Input
                  id={fieldId('dueDate')}
                  name="dueDate"
                  type="date"
                  aria-invalid={
                    errorText(field.state.meta.errors) ? true : undefined
                  }
                  aria-describedby={describedBy(
                    'dueDate',
                    `${id}-dueDate-help`,
                  )}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError
                  id={errorId('dueDate')}
                  message={errorText(field.state.meta.errors)}
                />
              </div>
            )}
          </form.Field>

          {/* F19 adds the label picker here. */}
          <fieldset disabled className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Labels</legend>
            <p className="text-sm">Labels arrive in a later release.</p>
          </fieldset>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">
              {isSubmitting ? 'Creating task…' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm font-medium text-destructive">
      {message}
    </p>
  )
}
