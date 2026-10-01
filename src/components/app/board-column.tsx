import { TaskCard } from './task-card'
import { TaskMoveMenu } from './task-move-menu'

import type { BoardTask } from './task-card'
import type { MoveProject } from './task-move-menu'

function taskCount(count: number) {
  return count === 1 ? '1 task' : `${count} tasks`
}

/**
 * One status on the board: a section named by its h2, with the task count
 * next to the name and the cards in a list. `tasks` is always the whole
 * column; a filter passes `shows` and the column hides the cards it rejects.
 * Each Move menu still gets the card's place in the whole column, so Move up
 * and Move down send the same index with or without a filter.
 */
export function BoardColumn({
  status,
  tasks,
  project,
  today,
  shows = () => true,
}: {
  status: { id: string; name: string }
  tasks: Array<BoardTask>
  project: MoveProject & { name: string }
  today: string
  shows?: (task: BoardTask) => boolean
}) {
  const headingId = `board-column-${status.id}`
  const shown = tasks.filter(shows).length

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
          {shown === tasks.length
            ? taskCount(tasks.length)
            : `${shown} of ${taskCount(tasks.length)}`}
        </span>
      </h2>
      {shown > 0 ? (
        <ul className="flex flex-col gap-2">
          {tasks.map((task, position) =>
            shows(task) ? (
              <TaskCard
                key={task.id}
                task={task}
                project={project}
                today={today}
                position={position}
                menu={
                  <TaskMoveMenu
                    task={task}
                    project={project}
                    position={position}
                    count={tasks.length}
                  />
                }
              />
            ) : null,
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {tasks.length > 0 ? 'No matching tasks' : 'No tasks'}
        </p>
      )}
    </section>
  )
}
