import { TaskCard } from './task-card'

import type { BoardTask } from './task-card'
import type { MoveProject } from './task-move-menu'

/**
 * One status on the board: a section named by its h2, with the task count
 * next to the name and the cards in a list.
 */
export function BoardColumn({
  status,
  tasks,
  project,
  today,
}: {
  status: { id: string; name: string }
  tasks: Array<BoardTask>
  project: MoveProject & { name: string }
  today: string
}) {
  const headingId = `board-column-${status.id}`

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3 md:w-72 md:shrink-0"
    >
      <h2
        id={headingId}
        className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold"
      >
        <span className="min-w-0 break-words">{status.name}</span>{' '}
        <span className="text-sm font-normal text-muted-foreground">
          {tasks.length === 1 ? '1 task' : `${tasks.length} tasks`}
        </span>
      </h2>
      {tasks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {tasks.map((task, position) => (
            <TaskCard
              key={task.id}
              task={task}
              project={project}
              today={today}
              position={position}
              count={tasks.length}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No tasks</p>
      )}
    </section>
  )
}
