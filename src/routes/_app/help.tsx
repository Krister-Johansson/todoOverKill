import { createFileRoute } from '@tanstack/react-router'

const title = 'Help'

// F27 builds the help page.
export const Route = createFileRoute('/_app/help')({
  staticData: { title },
  head: () => ({ meta: [{ title: `${title} · todoOverKill` }] }),
  component: HelpPage,
})

function HelpPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p>Help is not written yet.</p>
    </div>
  )
}
