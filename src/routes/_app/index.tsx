import { createFileRoute } from '@tanstack/react-router'

const title = 'Dashboard'

export const Route = createFileRoute('/_app/')({
  staticData: { title },
  head: () => ({ meta: [{ title: `${title} · todoOverKill` }] }),
  component: Dashboard,
})

function Dashboard() {
  return <h1 className="text-2xl font-semibold">{title}</h1>
}
