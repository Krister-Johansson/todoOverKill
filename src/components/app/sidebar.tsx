import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CircleHelp, LayoutDashboard, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'

import { projectsQueryOptions } from '#/fns/projects'

import { CreateProjectDialog } from './create-project-dialog'

import type { LinkProps } from '@tanstack/react-router'

const linkClass =
  'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-primary aria-[current=page]:text-sidebar-primary-foreground'

const items: Array<{
  to: LinkProps['to']
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
}> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Help', icon: CircleHelp },
]

type Project = ReturnType<typeof useProjects>[number]

/** The id of a project's sidebar link, so focus can be moved to it. */
export function projectLinkId(projectId: string) {
  return `sidebar-project-${projectId}`
}

function useProjects() {
  return useSuspenseQuery(projectsQueryOptions()).data
}

/**
 * The main navigation. The Projects label is a paragraph rather than a
 * heading, so the page's h1 stays the first heading in the document. The
 * project list comes from the query cache, which the _app loader fills on
 * the server, so it is in the first paint.
 */
export function Sidebar() {
  const projects = useProjects()
  const queryClient = useQueryClient()
  // A created project whose link has not rendered yet when the dialog closes.
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingFocus) return
    const link = document.getElementById(projectLinkId(pendingFocus))
    if (link) {
      link.focus()
      setPendingFocus(null)
    }
  }, [pendingFocus, projects])

  function addProject(project: Project) {
    const { queryKey } = projectsQueryOptions()
    queryClient.setQueryData(queryKey, (current = []) =>
      [...current.filter(({ id }) => id !== project.id), project].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    )
    void queryClient.invalidateQueries({ queryKey, exact: true })
  }

  function focusProject(project: Project) {
    const link = document.getElementById(projectLinkId(project.id))
    if (link) link.focus()
    else setPendingFocus(project.id)
  }

  return (
    <nav
      aria-label="Main"
      className="flex flex-col gap-6 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:border-r"
    >
      <Link
        to="/"
        className="flex min-h-11 items-center rounded-md px-3 text-lg font-semibold"
      >
        todoOverKill
      </Link>
      <div className="flex flex-col gap-2">
        <p
          id="sidebar-projects-label"
          className="px-3 text-sm font-semibold text-muted-foreground"
        >
          Projects
        </p>
        {projects.length > 0 ? (
          <ul
            aria-labelledby="sidebar-projects-label"
            className="flex flex-col gap-1"
          >
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  id={projectLinkId(project.id)}
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  className={linkClass}
                >
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color ?? undefined }}
                  />
                  <span className="min-w-0 break-words">{project.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 text-sm">No projects yet</p>
        )}
        <CreateProjectDialog
          onCreated={addProject}
          onFocusCreated={focusProject}
        />
      </div>
      <ul className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon, exact }) => (
          <li key={label}>
            <Link to={to} activeOptions={{ exact }} className={linkClass}>
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
