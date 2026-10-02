import { CHIP_FILL, projectColorName } from '#/lib/project-colors'
import { cn } from '#/lib/utils'

type LabelChipProps = {
  label: { name: string; color: string }
  className?: string
}

/**
 * A label's name in a pill with a 2 px border in the label colour and an
 * aria-hidden dot, so the colour is never the only cue. Only palette colours,
 * checked at 3:1 on every CHIP_SURFACES token, paint the border; any other
 * colour falls back to the theme border. The chip fills itself with
 * CHIP_FILL, so the border keeps 3:1 when a hovered card paints --accent
 * behind it.
 */
export function LabelChip({ label, className }: LabelChipProps) {
  const onPalette = projectColorName(label.color) !== undefined
  return (
    <span
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border-2 px-2 text-foreground',
        !onPalette && 'border-border',
        className,
      )}
      style={{
        backgroundColor: `var(--${CHIP_FILL})`,
        ...(onPalette ? { borderColor: label.color } : {}),
      }}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      <span className="min-w-0 break-words">{label.name}</span>
    </span>
  )
}
