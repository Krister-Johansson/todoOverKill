import {
  Minus,
  SignalHigh,
  SignalLow,
  SignalMedium,
  TriangleAlert,
} from 'lucide-react'

import type { Priority } from '#/generated/prisma/enums'
import type { LucideIcon } from 'lucide-react'

/**
 * How each priority is shown: a label that is always visible, an icon that
 * repeats it, and the text colour from the priority tokens in styles.css.
 * Colour is never the only cue (1.4.1).
 */
export const PRIORITY_DISPLAY: Record<
  Priority,
  { label: string; icon: LucideIcon; className: string }
> = {
  none: { label: 'No priority', icon: Minus, className: 'text-priority-none' },
  low: { label: 'Low', icon: SignalLow, className: 'text-priority-low' },
  medium: {
    label: 'Medium',
    icon: SignalMedium,
    className: 'text-priority-medium',
  },
  high: { label: 'High', icon: SignalHigh, className: 'text-priority-high' },
  urgent: {
    label: 'Urgent',
    icon: TriangleAlert,
    className: 'text-priority-urgent',
  },
}
