import type { DashboardTask } from '#/server/dashboard'

// The text of the MCP prompt daily_review (F37). A pure function of what
// listDashboardTasks returns, so it is tested without a database.

/** The most tasks each section lists; the rest are counted in one line. */
export const DAILY_REVIEW_LIMIT = 15

export type DailyReviewInput = {
  /** The day of the review, `YYYY-MM-DD`. */
  today: string
  dueToday: Array<DashboardTask>
  overdue: Array<DashboardTask>
}

const DAY = 24 * 60 * 60 * 1000

/** Whole days from `from` to `to`, both `YYYY-MM-DD`, counted in UTC. */
function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY,
  )
}

function taskLine(task: DashboardTask, today: string) {
  const details = [
    task.project.name,
    task.priority === 'none' ? 'no priority' : `${task.priority} priority`,
    `due ${task.dueDate}`,
  ]
  if (task.dueDate && task.dueDate < today) {
    const late = daysBetween(task.dueDate, today)
    details.push(`${late} ${late === 1 ? 'day' : 'days'} late`)
  }
  return `- ${task.project.key}-${task.number} ${task.title} (${details.join(', ')}), task://${task.id}`
}

/** A section heading and up to DAILY_REVIEW_LIMIT tasks, or Nothing. */
function section(title: string, tasks: Array<DashboardTask>, today: string) {
  if (tasks.length === 0) return `${title}:\nNothing.`
  const lines = tasks
    .slice(0, DAILY_REVIEW_LIMIT)
    .map((task) => taskLine(task, today))
  if (tasks.length > DAILY_REVIEW_LIMIT) {
    lines.push(`…and ${tasks.length - DAILY_REVIEW_LIMIT} more`)
  }
  return `${title} (${tasks.length}):\n${lines.join('\n')}`
}

/**
 * The daily review as one block of text: the day, the tasks due that day, the
 * overdue ones with how late they are, and what the model is asked to do.
 */
export function dailyReviewText({
  today,
  dueToday,
  overdue,
}: DailyReviewInput) {
  return [
    `Daily review for ${today}.`,
    section('Due today', dueToday, today),
    section('Overdue', overdue, today),
    'Suggest what I should work on first today, and which overdue tasks to re-plan or drop. Read task://{id} for a task you need more detail on, and ask me before calling update_task or move_task.',
  ].join('\n\n')
}
