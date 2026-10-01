import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, Outlet, createFileRoute } from '@tanstack/react-router'

import { projectQueryOptions } from '#/fns/projects'

const viewLinkClass =
  'flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground'

// The project layout: the project's h1 and the links to its views, with the
// current view below. F22 adds the List link next to Board.
export const Route = createFileRoute('/_app/projects/$projectId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(projectQueryOptions(params.projectId)),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? 'Project'} · todoOverKill` }],
  }),
  component: ProjectLayout,
})

function ProjectLayout() {
  const { projectId } = Route.useParams()
  const { data: project } = useSuspenseQuery(projectQueryOptions(projectId))

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold break-words">{project.name}</h1>
        <p className="text-sm">
          Key: <abbr title={`Project key ${project.key}`}>{project.key}</abbr>
        </p>
      </div>
      <nav aria-label="Project views">
        <ul className="flex flex-wrap gap-1">
          <li>
            <Link
              to="/projects/$projectId/board"
              params={{ projectId }}
              className={viewLinkClass}
            >
              Board
            </Link>
          </li>
        </ul>
      </nav>
      <Outlet />
    </div>
  )
}
