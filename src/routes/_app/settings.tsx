import { createFileRoute } from '@tanstack/react-router'

const title = 'Settings'

// F26 builds the settings page.
export const Route = createFileRoute('/_app/settings')({
  staticData: { title },
  head: () => ({ meta: [{ title: `${title} · todoOverKill` }] }),
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p>There are no settings yet.</p>
    </div>
  )
}
