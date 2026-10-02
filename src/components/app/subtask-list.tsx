import {
  mutationOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  addSubtaskFn,
  deleteSubtaskFn,
  subtasksQueryOptions,
  updateSubtaskFn,
} from '#/fns/subtasks'
import { taskActivityQueryOptions } from '#/fns/tasks'
import { createSubtaskSchema } from '#/schemas/subtask'

import { useAnnounce } from './live-region'

import type { QueryClient } from '@tanstack/react-query'
import type { listSubtasksFn } from '#/fns/subtasks'

export type Subtask = Awaited<ReturnType<typeof listSubtasksFn>>[number]

/**
 * Every subtask mutation on a task shares this key prefix, so isMutating
 * counts the ones in flight.
 */
export function subtaskMutationKey(taskId: string) {
  return ['subtasks', taskId] as const
}

/** The first problem with a title, or undefined when it is fine. */
function titleError(title: string) {
  return createSubtaskSchema.safeParse({ title }).error?.issues[0]?.message
}

/**
 * Runs after every subtask mutation. The list refetches only once the last
 * one in flight settles: a refetch while another row's toggle is pending
 * would show that row's old state until its own write lands. The activity
 * log refetches every time, since it holds no optimistic state.
 */
function settle(queryClient: QueryClient, taskId: string) {
  // The settling mutation still counts as pending here.
  if (
    queryClient.isMutating({ mutationKey: subtaskMutationKey(taskId) }) === 1
  ) {
    void queryClient.invalidateQueries({
      queryKey: subtasksQueryOptions(taskId).queryKey,
    })
  }
  void queryClient.invalidateQueries({
    queryKey: taskActivityQueryOptions(taskId).queryKey,
  })
}

function replaceRow(
  queryClient: QueryClient,
  taskId: string,
  id: string,
  change: (row: Subtask) => Subtask,
) {
  queryClient.setQueryData(subtasksQueryOptions(taskId).queryKey, (rows) =>
    rows?.map((row) => (row.id === id ? change(row) : row)),
  )
}

/**
 * The toggle mutation. The checkbox changes in the cache at once and the
 * live region speaks once the server agrees. A failure puts back only this
 * row's done state, so another row's toggle in flight keeps its own.
 */
export function toggleSubtaskMutationOptions({
  queryClient,
  taskId,
  subtask,
  announce,
}: {
  queryClient: QueryClient
  taskId: string
  subtask: Pick<Subtask, 'id' | 'title'>
  announce: (message: string) => void
}) {
  const subtasksKey = subtasksQueryOptions(taskId).queryKey

  return mutationOptions({
    mutationKey: [...subtaskMutationKey(taskId), 'toggle', subtask.id],
    mutationFn: (done: boolean) =>
      updateSubtaskFn({ data: { subtaskId: subtask.id, data: { done } } }),
    onMutate: async (done) => {
      await queryClient.cancelQueries({ queryKey: subtasksKey })
      const previous = queryClient
        .getQueryData(subtasksKey)
        ?.find((row) => row.id === subtask.id)?.done
      replaceRow(queryClient, taskId, subtask.id, (row) => ({ ...row, done }))
      return { previous: previous ?? !done }
    },
    onSuccess: (updated) => {
      replaceRow(queryClient, taskId, subtask.id, () => updated)
      announce(`Subtask ${updated.title} ${updated.done ? 'done' : 'not done'}`)
    },
    onError: (_error, done, context) => {
      const previous = context?.previous ?? !done
      replaceRow(queryClient, taskId, subtask.id, (row) => ({
        ...row,
        done: previous,
      }))
      announce(`Could not save subtask ${subtask.title}. Try again.`)
    },
    onSettled: () => settle(queryClient, taskId),
  })
}

type Ids = {
  checkbox: (id: string) => string
  edit: (id: string) => string
  remove: (id: string) => string
  rename: (id: string) => string
  newTitle: string
}

type SubtaskListProps = {
  taskId: string
  headingLevel?: 2 | 3
}

/**
 * A task's subtasks as a checklist with a "2 of 5 done" line, each row with
 * Edit and Delete buttons, and a form below that adds one. The count line is
 * not a live region: every change is announced through useAnnounce, which
 * names the subtask, and the one live region stays the only one (4.1.3).
 *
 * Focus: after an add it is in the New subtask input; after a rename or a
 * cancelled rename it is on the row's Edit button; after a delete it is on
 * the next row's checkbox (or its Title input while it is being renamed),
 * else the previous row's, else the New subtask input. A delete asks for no
 * confirmation.
 */
export function SubtaskList({ taskId, headingLevel = 2 }: SubtaskListProps) {
  const Heading = `h${headingLevel}` as const
  const baseId = useId()
  const { data: subtasks } = useSuspenseQuery(subtasksQueryOptions(taskId))
  const [editingId, setEditingId] = useState<string | null>(null)
  // Read by a rename that resolves after its form has gone, which still
  // holds the editingId of the render it came from.
  const editingRef = useRef<string | null>(null)
  // The ids of the elements to try, in order, once the next render commits.
  const pendingFocus = useRef<Array<string>>([])
  const [, setFocusRequest] = useState(0)

  useEffect(() => {
    const candidates = pendingFocus.current
    if (candidates.length === 0) return
    pendingFocus.current = []
    for (const id of candidates) {
      const element = document.getElementById(id)
      if (element) {
        element.focus()
        return
      }
    }
  })

  function focusAfterRender(...candidates: Array<string>) {
    pendingFocus.current = candidates
    setFocusRequest((count) => count + 1)
  }

  function edit(id: string | null) {
    editingRef.current = id
    setEditingId(id)
  }

  const ids: Ids = {
    checkbox: (id) => `${baseId}-check-${id}`,
    edit: (id) => `${baseId}-edit-${id}`,
    remove: (id) => `${baseId}-delete-${id}`,
    rename: (id) => `${baseId}-rename-${id}`,
    newTitle: `${baseId}-new`,
  }
  const doneCount = subtasks.filter((subtask) => subtask.done).length

  return (
    <section
      aria-labelledby={`${baseId}-heading`}
      className="flex min-w-0 flex-col gap-3"
    >
      <Heading id={`${baseId}-heading`} className="text-lg font-semibold">
        Subtasks
      </Heading>
      <p className="text-muted-foreground">
        {subtasks.length > 0
          ? `${doneCount} of ${subtasks.length} done`
          : 'No subtasks yet'}
      </p>
      {subtasks.length > 0 && (
        <ul className="flex max-w-prose min-w-0 flex-col gap-1">
          {subtasks.map((subtask) => (
            <li key={subtask.id} className="min-w-0">
              {editingId === subtask.id ? (
                <RenameForm
                  taskId={taskId}
                  subtask={subtask}
                  inputId={ids.rename(subtask.id)}
                  onDone={() => {
                    // A rename that lands after Cancel, or after Edit on
                    // another row, leaves the current edit alone.
                    if (editingRef.current !== subtask.id) return
                    edit(null)
                    focusAfterRender(ids.edit(subtask.id))
                  }}
                />
              ) : (
                <SubtaskRow
                  taskId={taskId}
                  subtask={subtask}
                  ids={ids}
                  onEdit={() => edit(subtask.id)}
                  focusAfterRender={focusAfterRender}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <AddSubtaskForm
        taskId={taskId}
        inputId={ids.newTitle}
        focusAfterRender={focusAfterRender}
      />
    </section>
  )
}

function SubtaskRow({
  taskId,
  subtask,
  ids,
  onEdit,
  focusAfterRender,
}: {
  taskId: string
  subtask: Subtask
  ids: Ids
  onEdit: () => void
  focusAfterRender: (...candidates: Array<string>) => void
}) {
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const subtasksKey = subtasksQueryOptions(taskId).queryKey
  const toggle = useMutation(
    toggleSubtaskMutationOptions({ queryClient, taskId, subtask, announce }),
  )
  const remove = useMutation({
    mutationKey: [...subtaskMutationKey(taskId), 'delete', subtask.id],
    mutationFn: () => deleteSubtaskFn({ data: subtask.id }),
    onSuccess: () => {
      const rows = queryClient.getQueryData(subtasksKey) ?? []
      const index = rows.findIndex((row) => row.id === subtask.id)
      const rest = rows.filter((row) => row.id !== subtask.id)
      // Taken before the row goes, while its Delete button still has focus.
      const active = document.activeElement
      const hadFocus =
        !active ||
        active === document.body ||
        active.id === ids.remove(subtask.id)
      queryClient.setQueryData(subtasksKey, rest)
      if (hadFocus) {
        const next = index >= 0 ? (rest[index] ?? rest[index - 1]) : undefined
        // A row being renamed has no checkbox, only its Title input.
        if (next) {
          focusAfterRender(
            ids.checkbox(next.id),
            ids.rename(next.id),
            ids.newTitle,
          )
        } else {
          focusAfterRender(ids.newTitle)
        }
      }
      announce(`Subtask ${subtask.title} deleted`)
    },
    onError: () =>
      announce(`Could not delete subtask ${subtask.title}. Try again.`),
    onSettled: () => settle(queryClient, taskId),
  })

  function onCheckedChange(checked: boolean) {
    // The row is going; a toggle now would fail once it has.
    if (remove.isPending) return
    // One toggle per row at a time, so their results arrive in order.
    if (toggle.isPending) {
      announce(
        `Subtask ${subtask.title} is still saving. Try again in a moment.`,
      )
      return
    }
    toggle.mutate(checked)
  }

  return (
    <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-2">
      <div className="flex min-w-0 flex-[1_1_12rem] items-center">
        <Checkbox
          id={ids.checkbox(subtask.id)}
          checked={subtask.done}
          aria-disabled={remove.isPending || undefined}
          onCheckedChange={(checked) => onCheckedChange(checked === true)}
        />
        <Label
          htmlFor={ids.checkbox(subtask.id)}
          className="min-h-11 min-w-0 flex-1 cursor-pointer text-base font-normal"
        >
          {/* The label is a flex box, so the title needs its own min-w-0
              item to break inside a long word instead of widening the row. */}
          <span className="min-w-0 break-words">{subtask.title}</span>
        </Label>
      </div>
      <div className="flex gap-1">
        <Button
          id={ids.edit(subtask.id)}
          variant="ghost"
          aria-disabled={remove.isPending || undefined}
          onClick={() => {
            // The form would vanish with the row, taking focus with it.
            if (!remove.isPending) onEdit()
          }}
        >
          Edit <span className="sr-only">{subtask.title}</span>
        </Button>
        <Button
          id={ids.remove(subtask.id)}
          variant="ghost"
          aria-disabled={remove.isPending || undefined}
          onClick={() => {
            if (!remove.isPending) remove.mutate()
          }}
        >
          Delete <span className="sr-only">{subtask.title}</span>
        </Button>
      </div>
    </div>
  )
}

function RenameForm({
  taskId,
  subtask,
  inputId,
  onDone,
}: {
  taskId: string
  subtask: Subtask
  inputId: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(subtask.title)
  const [error, setError] = useState<string>()
  const rename = useMutation({
    mutationKey: [...subtaskMutationKey(taskId), 'rename', subtask.id],
    mutationFn: (next: string) =>
      updateSubtaskFn({
        data: { subtaskId: subtask.id, data: { title: next } },
      }),
    onSuccess: (updated) => {
      replaceRow(queryClient, taskId, subtask.id, () => updated)
      onDone()
      announce(`Subtask renamed to ${updated.title}`)
    },
    onError: () =>
      announce(`Could not rename subtask ${subtask.title}. Try again.`),
    onSettled: () => settle(queryClient, taskId),
  })

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (rename.isPending) return
    const problem = titleError(title)
    setError(problem)
    if (problem) {
      inputRef.current?.focus()
      return
    }
    if (title.trim() === subtask.title) {
      onDone()
      return
    }
    rename.mutate(title)
  }

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onDone()
        }
      }}
      className="flex min-w-0 flex-col gap-2 py-1"
    >
      <Label htmlFor={inputId}>Title</Label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          id={inputId}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="flex-[1_1_12rem]"
        />
        <div className="flex gap-1">
          <Button type="submit" aria-disabled={rename.isPending || undefined}>
            Save
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
      {error && (
        <p
          id={`${inputId}-error`}
          className="text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}
    </form>
  )
}

function AddSubtaskForm({
  taskId,
  inputId,
  focusAfterRender,
}: {
  taskId: string
  inputId: string
  focusAfterRender: (...candidates: Array<string>) => void
}) {
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string>()
  const add = useMutation({
    mutationKey: [...subtaskMutationKey(taskId), 'add'],
    mutationFn: (next: string) =>
      addSubtaskFn({ data: { taskId, data: { title: next } } }),
    onSuccess: (added) => {
      queryClient.setQueryData(subtasksQueryOptions(taskId).queryKey, (rows) =>
        rows?.some((row) => row.id === added.id)
          ? rows
          : [...(rows ?? []), added],
      )
      setTitle('')
      focusAfterRender(inputId)
      announce(`Subtask ${added.title} added`)
    },
    onError: () => announce('Could not add the subtask. Try again.'),
    onSettled: () => settle(queryClient, taskId),
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (add.isPending) return
    const problem = titleError(title)
    setError(problem)
    if (problem) {
      inputRef.current?.focus()
      return
    }
    add.mutate(title)
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex max-w-prose min-w-0 flex-col gap-2"
    >
      <Label htmlFor={inputId}>New subtask</Label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          id={inputId}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="flex-[1_1_12rem]"
        />
        <Button type="submit" aria-disabled={add.isPending || undefined}>
          Add
        </Button>
      </div>
      {error && (
        <p
          id={`${inputId}-error`}
          className="text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}
    </form>
  )
}
