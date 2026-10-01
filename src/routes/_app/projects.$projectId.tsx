import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { projectQueryOptions } from '#/fns/projects'

// Temporary: gives the sidebar links a destination. F13 replaces this page
// with the project layout and its view tabs.
export const Route = createFileRoute('/_app/projects/$projectId')({
  // A placeholder until F48 puts the project name in the breadcrumb.
  staticData: { title: 'Project' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(projectQueryOptions(params.projectId)),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? 'Project'} · todoOverKill` }],
  }),
  component: ProjectPage,
})

function ProjectPage() {
  const { projectId } = Route.useParams()
  const { data: project } = useSuspenseQuery(projectQueryOptions(projectId))

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold break-words">{project.name}</h1>
      <p className="text-sm">
        Key: <abbr title={`Project key ${project.key}`}>{project.key}</abbr>
      </p>
    </div>
  )
}
