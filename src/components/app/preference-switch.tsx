import { useId } from 'react'

import { Label } from '#/components/ui/label'
import { Switch } from '#/components/ui/switch'
import { usePreference } from '#/hooks/use-preference'

import { useAnnounce } from './live-region'

import type { PreferenceName } from '#/lib/preferences'

/**
 * One on or off setting: a visible label, a description and a switch bound to
 * the stored value. Applies and announces on change. A disabled switch shows
 * its note in the same text colour as the description and lists it in
 * aria-describedby, so the reason it is off is both seen and read.
 */
export function PreferenceSwitch({
  name,
  label,
  description,
  disabled = false,
  note,
}: {
  name: PreferenceName
  label: string
  description: string
  disabled?: boolean
  note?: string
}) {
  const { value, setValue } = usePreference(name)
  const announce = useAnnounce()
  const id = useId()
  const descriptionId = `${id}-description`
  const noteId = `${id}-note`

  return (
    <div className="flex min-h-11 items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id} className="min-h-11 text-base font-semibold">
          {label}
        </Label>
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
        {note ? (
          <p id={noteId} className="text-sm text-muted-foreground">
            {note}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={value === 'on'}
        disabled={disabled}
        aria-describedby={note ? `${descriptionId} ${noteId}` : descriptionId}
        onCheckedChange={(checked) => {
          setValue(checked ? 'on' : 'off')
          announce(`${label} turned ${checked ? 'on' : 'off'}`)
        }}
      />
    </div>
  )
}
