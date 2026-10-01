import { useId } from 'react'

import { useMotionSetting } from '#/hooks/use-reduced-motion'

import { useAnnounce } from './live-region'
import { optionClass } from './theme-switch'

import type { MotionSetting } from '#/lib/motion'

const options: Array<{ value: MotionSetting; label: string }> = [
  { value: 'system', label: 'Follow system' },
  { value: 'reduce', label: 'Reduce' },
  { value: 'allow', label: 'Allow' },
]

/**
 * Radio group for the motion override (docs/accessibility.md 2.3.3). Applies
 * and announces on change.
 */
export function MotionSwitch() {
  const { setting, setMotionSetting } = useMotionSetting()
  const announce = useAnnounce()
  const name = useId()
  const descriptionId = `${name}-description`

  return (
    <fieldset aria-describedby={descriptionId} className="flex flex-col gap-2">
      <legend className="text-base font-semibold">Motion</legend>
      <p id={descriptionId} className="text-sm text-muted-foreground">
        Reduce turns off movement, so changes happen at once.
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
                setMotionSetting(value)
                announce(`Motion set to ${label}`)
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
