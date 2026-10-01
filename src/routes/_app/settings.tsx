import { createFileRoute } from '@tanstack/react-router'

import { MotionSwitch } from '#/components/app/motion-switch'
import { ThemeSwitch } from '#/components/app/theme-switch'

const title = 'Settings'

// F08 adds the appearance controls; F26 builds the rest of the page.
export const Route = createFileRoute('/_app/settings')({
  staticData: { title },
  head: () => ({ meta: [{ title: `${title} · todoOverKill` }] }),
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <section
        aria-labelledby="settings-appearance"
        className="flex flex-col gap-6"
      >
        <h2 id="settings-appearance" className="text-lg font-semibold">
          Appearance
        </h2>
        <ThemeSwitch />
        <MotionSwitch />
      </section>
    </div>
  )
}
