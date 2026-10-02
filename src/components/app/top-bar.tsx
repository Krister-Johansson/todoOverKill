import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useRef } from 'react'

import { projectQueryOptions } from '#/fns/projects'

import { CommandPalette } from './command-palette'
import { CreateTaskDialog } from './create-task-dialog'

import type { CreateTaskDialogHandle } from './create-task-dialog'

/**
 * The top bar. The breadcrumb shows only the current page until F48 builds
 * the full trail. The Search button opens the command palette, as Ctrl+K and
 * ⌘+K do on every page. On a project route the bar holds the New task button,
 * which `c` and the palette's New task action also open. Not sticky, so it
 * never covers the focused element (2.4.12).
 */
export function TopBar({ currentPage }: { currentPage: string }) {
  const { projectId } = useParams({ strict: false })
  const createTask = useRef<CreateTaskDialogHandle>(null)
  // The project layout's loader fills this cache entry before the page
  // renders, on the server too, so the button is in the first paint and
  // mounting starts no refetch. When the loader found no project the entry is
  // empty, and this query fetches once, with no retries and no refetch when
  // the window regains focus, and the button stays hidden.
  const { data: project } = useQuery({
    ...projectQueryOptions(projectId ?? ''),
    enabled: !!projectId,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  })

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-2">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 text-sm">
          <li>
            <span aria-current="page" className="font-medium">
              {currentPage}
            </span>
          </li>
        </ol>
      </nav>
      <div className="flex min-w-0 flex-wrap items-center gap-4">
        {projectId && project ? (
          // Keyed so a different project starts with a fresh form.
          <CreateTaskDialog
            key={project.id}
            ref={createTask}
            project={project}
          />
        ) : null}
        <CommandPalette
          openCreateTask={
            projectId && project ? () => createTask.current?.open() : undefined
          }
        />
      </div>
    </header>
  )
}
