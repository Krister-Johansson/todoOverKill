import { useId } from 'react'

import { useTheme } from '#/hooks/use-theme'

import { useAnnounce } from './live-region'

import type { ThemeSetting } from '#/lib/theme'

const options: Array<{ value: ThemeSetting; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export const optionClass =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 text-sm font-medium'

/** Radio group for the colour theme. Applies and announces on change. */
export function ThemeSwitch() {
  const { setting, setTheme } = useTheme()
  const announce = useAnnounce()
  const name = useId()
  const descriptionId = `${name}-description`

  return (
    <fieldset aria-describedby={descriptionId} className="flex flex-col gap-2">
      <legend className="text-base font-semibold">Theme</legend>
      <p id={descriptionId} className="text-sm text-muted-foreground">
        System follows your device's light or dark setting.
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map(({ value, label }) => (
          <label key={value} className={optionClass}>
            <input
              type="radio"
              name={name}
              value={value}
              checked={setting === value}
              onChange={() => {
                setTheme(value)
                announce(`Theme set to ${label}`)
              }}
              className="size-4 accent-primary"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
