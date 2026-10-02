import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Search } from 'lucide-react'

import { projectQueryOptions } from '#/fns/projects'

import { CreateTaskDialog } from './create-task-dialog'

/**
 * The top bar. The breadcrumb shows only the current page until F48 builds
 * the full trail, and the search form is a placeholder for F65. On a project
 * route it holds the New task button, which `c` also opens. Not sticky, so it
 * never covers the focused element (2.4.12).
 */
export function TopBar({ currentPage }: { currentPage: string }) {
  const { projectId } = useParams({ strict: false })
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
          <CreateTaskDialog key={project.id} project={project} />
        ) : null}
        <form
          role="search"
          aria-label="Search"
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => event.preventDefault()}
        >
          <label htmlFor="top-bar-search" className="text-sm font-medium">
            Search
          </label>
          <input
            id="top-bar-search"
            type="search"
            name="q"
            className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm sm:w-56"
          />
          <button
            type="submit"
            className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <Search aria-hidden="true" className="size-4" />
            Search
          </button>
        </form>
      </div>
    </header>
  )
}
