import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  LoaderCircle,
  Square,
} from 'lucide-react'

import {
  TOOL_CALL_STATUS_LABELS,
  toolCallStatus,
  toolDisplayName,
  toolErrorText,
  toolResultSummary,
} from '#/lib/tool-call'

import type { ToolCallPart, ToolResultPart } from '#/lib/tool-call'

const STATUS_ICONS = {
  running: LoaderCircle,
  done: CircleCheck,
  failed: CircleAlert,
  'needs-approval': CircleHelp,
  stopped: Square,
}

/**
 * One tool the assistant used, in its reply: the tool's name in plain
 * words, its status as text beside an icon, and once done a one-line
 * summary of the result, such as "2 tasks", never the result itself. A
 * failed call shows the tool's error. It is a group named "Tool call: List
 * tasks", so a screen reader says what it is before reading it. The status
 * is never told by colour or the icon alone, and the spinner turns only
 * without prefers-reduced-motion.
 */
export function ToolCallCard({
  part,
  result,
  isLoading,
}: {
  part: ToolCallPart
  result?: ToolResultPart
  isLoading: boolean
}) {
  const name = toolDisplayName(part.name)
  const status = toolCallStatus(part, result, isLoading)
  const Icon = STATUS_ICONS[status]
  const error = status === 'failed' ? toolErrorText(part, result) : undefined

  return (
    <div
      role="group"
      aria-label={`Tool call: ${name}`}
      className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm"
    >
      <p className="font-semibold">{name}</p>
      <p className="flex items-center gap-2">
        <Icon
          aria-hidden="true"
          className={
            status === 'running' ? 'size-4 motion-safe:animate-spin' : 'size-4'
          }
        />
        {TOOL_CALL_STATUS_LABELS[status]}
      </p>
      {status === 'done' ? <p>{toolResultSummary(part.output)}</p> : null}
      {error ? <p className="font-medium text-destructive">{error}</p> : null}
    </div>
  )
}
