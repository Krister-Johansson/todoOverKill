import {
  mutationOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react'
import { useId, useRef } from 'react'

import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { projectQueryOptions } from '#/fns/projects'
import { moveTaskFn, taskQueryOptions, tasksQueryOptions } from '#/fns/tasks'
import { moveDownInput, moveTaskInList, moveUpInput } from '#/lib/board-move'

import { useAnnounce } from './live-region'
import { focusMoveButton, moveButtonId } from './task-card'

import type { QueryClient } from '@tanstack/react-query'
import type { MoveTarget } from '#/lib/board-move'
import type { BoardTask } from './task-card'

export type MoveProject = {
  id: string
  key: string
  statuses: Array<BoardTask['status']>
}

type MoveTask = { id: string; number: number; statusId: string }

/** What the menu asks for: another status, or one step up or down. */
export type MoveRequest =
  | { kind: 'status'; statusId: string }
  | { kind: 'up' | 'down'; position: number }

/** Every move shares this key prefix, so isMutating counts moves in flight. */
const MOVE_KEY = ['tasks', 'move'] as const

function toTarget(request: MoveRequest): MoveTarget {
  if (request.kind === 'status') return { statusId: request.statusId }
  return request.kind === 'up'
    ? moveUpInput(request.position)
    : moveDownInput(request.position)
}

/**
 * The status name for the announcement. moveTask returns the task with its
 * status; the project's statuses are the fallback should it ever come back
 * without one.
 */
function statusName(
  moved: { statusId: string; status?: { name: string } | null },
  statuses: MoveProject['statuses'],
) {
  return (
    moved.status?.name ??
    statuses.find((status) => status.id === moved.statusId)?.name
  )
}

/**
 * The move mutation. Every callback lives here rather than on mutate(),
 * because a card that changes column unmounts, and only these still run then.
 * The board's cache changes at once and the live region speaks once the
 * server agrees. A failure puts the cache back only when no other move is in
 * flight, since the snapshot would also undo that move; otherwise the refetch
 * settles it.
 */
export function moveTaskMutationOptions({
  queryClient,
  project,
  task,
  announce,
}: {
  queryClient: QueryClient
  project: MoveProject
  task: MoveTask
  announce: (message: string) => void
}) {
  const reference = `${project.key}-${task.number}`
  const tasksKey = tasksQueryOptions(project.id).queryKey

  return mutationOptions({
    mutationKey: [...MOVE_KEY, task.id],
    mutationFn: (request: MoveRequest) =>
      moveTaskFn({ data: { taskId: task.id, data: toTarget(request) } }),
    onMutate: async (request) => {
      await queryClient.cancelQueries({ queryKey: tasksKey })
      const previous = queryClient.getQueryData(tasksKey)
      if (previous) {
        queryClient.setQueryData(
          tasksKey,
          moveTaskInList(
            previous,
            task.id,
            toTarget(request),
            project.statuses,
          ),
        )
      }
      return { previous }
    },
    onSuccess: (moved, request) => {
      if (request.kind !== 'status') {
        announce(`Moved ${reference} ${request.kind}`)
        return
      }
      const name = statusName(moved, project.statuses)
      announce(name ? `Moved ${reference} to ${name}` : `Moved ${reference}`)
    },
    onError: (_error, _request, context) => {
      // The card goes back to its old place, and focus goes with it unless
      // the user has moved on.
      const active = document.activeElement
      if (
        !active ||
        active === document.body ||
        active.id === moveButtonId(task.id)
      ) {
        focusMoveButton(task.id)
      }
      // The failing move still counts as pending while onError runs.
      if (
        context?.previous &&
        queryClient.isMutating({ mutationKey: MOVE_KEY }) === 1
      ) {
        queryClient.setQueryData(tasksKey, context.previous)
      }
      // The status may be gone, so the project's statuses are stale too.
      void queryClient.invalidateQueries({
        queryKey: projectQueryOptions(project.id).queryKey,
      })
      announce(`Could not move ${reference}. Try again.`)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKey })
      // The task page's query is not under the project's key.
      void queryClient.invalidateQueries({
        queryKey: taskQueryOptions(task.id).queryKey,
      })
    },
  })
}

/**
 * A card's Move menu: a menu button named "Move KEY-N" that lists the
 * project's statuses as radio items, the current one checked, then Move up
 * and Move down, disabled at the top and bottom of the column. The menu is
 * not modal, so Radix never hides the live region from assistive technology
 * while a move is announced. After a pick, focus stays with the card's Move
 * button wherever the card lands; Escape returns focus to the button.
 */
export function TaskMoveMenu({
  task,
  project,
  position,
  count,
}: {
  task: MoveTask
  project: MoveProject
  position: number
  count: number
}) {
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const labelId = useId()
  // Set by a pick, so closing the menu leaves focus to focusMoveButton.
  const picked = useRef(false)
  const { mutate } = useMutation(
    moveTaskMutationOptions({ queryClient, project, task, announce }),
  )
  const reference = `${project.key}-${task.number}`

  function move(request: MoveRequest) {
    // One move per task at a time, so their results arrive in order.
    if (queryClient.isMutating({ mutationKey: [...MOVE_KEY, task.id] }) > 0)
      return
    picked.current = true
    focusMoveButton(task.id)
    mutate(request)
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button id={moveButtonId(task.id)} variant="ghost" className="px-3">
          Move <span className="sr-only">{reference}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (!picked.current) return
          picked.current = false
          event.preventDefault()
        }}
      >
        <DropdownMenuLabel id={labelId}>Move to</DropdownMenuLabel>
        <DropdownMenuRadioGroup aria-labelledby={labelId} value={task.statusId}>
          {project.statuses.map((status) => (
            <DropdownMenuRadioItem
              key={status.id}
              value={status.id}
              onSelect={() => {
                if (status.id !== task.statusId) {
                  move({ kind: 'status', statusId: status.id })
                }
              }}
            >
              {status.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={position === 0}
          onSelect={() => move({ kind: 'up', position })}
        >
          <ArrowUp aria-hidden="true" />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={position >= count - 1}
          onSelect={() => move({ kind: 'down', position })}
        >
          <ArrowDown aria-hidden="true" />
          Move down
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
