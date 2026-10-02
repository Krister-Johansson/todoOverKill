import { Link } from '@tanstack/react-router'

import type { listProjectProgressFn } from '#/fns/dashboard'

type ProjectProgressRow = Awaited<
  ReturnType<typeof listProjectProgressFn>
>[number]

/**
 * A project's progress in words: "7 of 21 tasks done", "1 of 1 task done",
 * or "No tasks yet".
 */
export function progressText(total: number, done: number) {
  if (total === 0) return 'No tasks yet'
  return `${done} of ${total} ${total === 1 ? 'task' : 'tasks'} done`
}

/**
 * Every unarchived project as a row with a link to its board, named by the
 * project, and its progress as text, never a bar alone.
 */
export function ProjectProgress({ rows }: { rows: Array<ProjectProgressRow> }) {
  return (
    <section
      aria-labelledby="dashboard-projects"
      className="flex min-w-0 flex-col gap-3"
    >
      <h2 id="dashboard-projects" className="text-lg font-semibold">
        Projects
      </h2>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rows.map((project) => (
            <li
              key={project.id}
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card p-3 text-card-foreground"
            >
              {/* min-w-11 keeps a one-letter name a 44 by 44 px target; the
                  span lets a long name with no spaces break at 320 px. */}
              <Link
                to="/projects/$projectId/board"
                params={{ projectId: project.id }}
                className="inline-flex min-h-11 min-w-11 items-center font-medium underline underline-offset-4"
              >
                <span className="min-w-0 break-words">{project.name}</span>
              </Link>
              <span className="text-muted-foreground">
                {progressText(project.total, project.done)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No projects yet.</p>
      )}
    </section>
  )
}
