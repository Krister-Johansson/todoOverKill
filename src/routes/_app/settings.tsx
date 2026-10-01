import { createFileRoute } from '@tanstack/react-router'

import { MotionSwitch } from '#/components/app/motion-switch'
import { PreferenceSwitch } from '#/components/app/preference-switch'
import { ThemeSwitch } from '#/components/app/theme-switch'

const title = 'Settings'

const voiceNote = 'Not available yet. Voice arrives in a later release.'

export const Route = createFileRoute('/_app/settings')({
  staticData: { title },
  head: () => ({ meta: [{ title: `${title} · todoOverKill` }] }),
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
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
      <section
        aria-labelledby="settings-keyboard"
        className="flex flex-col gap-6"
      >
        <h2 id="settings-keyboard" className="text-lg font-semibold">
          Keyboard
        </h2>
        <PreferenceSwitch
          name="shortcuts"
          label="Single-key shortcuts"
          description="Shortcuts such as c for a new task work when focus is outside a text field."
        />
      </section>
      <section aria-labelledby="settings-voice" className="flex flex-col gap-6">
        <h2 id="settings-voice" className="text-lg font-semibold">
          Voice
        </h2>
        {/* F41 and F42 enable these. */}
        <PreferenceSwitch
          name="sendOnPause"
          label="Send when I stop speaking"
          description="Sends a spoken message to the assistant after a pause, without pressing Send."
          disabled
          note={voiceNote}
        />
        <PreferenceSwitch
          name="readAloud"
          label="Read replies aloud"
          description="The assistant speaks its replies as well as showing them."
          disabled
          note={voiceNote}
        />
      </section>
    </div>
  )
}
