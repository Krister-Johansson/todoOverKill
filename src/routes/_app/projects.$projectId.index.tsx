import { createFileRoute, redirect } from '@tanstack/react-router'

// The bare project URL, which the sidebar links to, opens the board. This is
// the URL being made canonical while it loads, not a change of context after
// user input (3.2.5).
export const Route = createFileRoute('/_app/projects/$projectId/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/projects/$projectId/board', params })
  },
})
