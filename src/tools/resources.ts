import type { listComments } from '#/server/comments'
import type { listLabels } from '#/server/labels'
import type { getProject } from '#/server/projects'
import type { listSubtasks } from '#/server/subtasks'
import type { getTask, listTasks } from '#/server/tasks'

// The Markdown the MCP resources project://{id} and task://{id} return (F37).
// Pure functions of what the services return, so the server reads the data
// and these only lay it out. Titles are written as they are, and descriptions
// and comment bodies are Markdown already.

type Project = Awaited<ReturnType<typeof getProject>>
type Task = Awaited<ReturnType<typeof getTask>>

export type ProjectMarkdownInput = {
  project: Project
  tasks: Awaited<ReturnType<typeof listTasks>>
  labels: Awaited<ReturnType<typeof listLabels>>
}

export type TaskMarkdownInput = {
  task: Task
  project: Project
  subtasks: Awaited<ReturnType<typeof listSubtasks>>
  comments: Awaited<ReturnType<typeof listComments>>
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** `- item` lines, or `empty` alone when there are none. */
function list(items: Array<string>, empty: string) {
  return items.length === 0
    ? empty
    : items.map((item) => `- ${item}`).join('\n')
}

/** A task as one list item: its reference, title, and the fields it has set. */
function taskLine(key: string, task: ProjectMarkdownInput['tasks'][number]) {
  const details = [
    task.priority === 'none' ? undefined : `${task.priority} priority`,
    task.dueDate ? `due ${task.dueDate}` : undefined,
    ...task.labels.map((label) => label.name),
  ].filter((detail) => detail !== undefined)
  const suffix = details.length === 0 ? '' : ` (${details.join(', ')})`
  return `${key}-${task.number} ${task.title}${suffix}, task://${task.id}`
}

/**
 * A project as Markdown: its key and name, description, statuses with their
 * task counts, labels, and tasks under one heading per status in board order.
 */
export function projectMarkdown({
  project,
  tasks,
  labels,
}: ProjectMarkdownInput) {
  const sections = [
    `# ${project.key} ${project.name}`,
    project.description ?? 'No description',
  ]
  if (project.archivedAt) {
    sections.push(`Archived on ${project.archivedAt.toISOString()}.`)
  }
  const byStatus = project.statuses.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.statusId === status.id),
  }))
  sections.push(
    '## Statuses',
    list(
      byStatus.map(
        ({ status, tasks: inStatus }) =>
          `${status.name}: ${plural(inStatus.length, 'task')}`,
      ),
      'No statuses',
    ),
    '## Labels',
    list(
      labels.map((label) => label.name),
      'No labels',
    ),
    '## Tasks',
  )
  for (const { status, tasks: inStatus } of byStatus) {
    sections.push(
      `### ${status.name}`,
      list(
        inStatus.map((task) => taskLine(project.key, task)),
        'No tasks',
      ),
    )
  }
  return `${sections.join('\n\n')}\n`
}

/**
 * A task as Markdown: its reference and title, its fields, description,
 * subtasks as checkboxes, and comments oldest first. Moments are ISO
 * timestamps in UTC; the due date is a calendar day.
 */
export function taskMarkdown({
  task,
  project,
  subtasks,
  comments,
}: TaskMarkdownInput) {
  const fields = [
    `Project: ${project.key} ${project.name}, project://${project.id}`,
    `Status: ${task.status.name}`,
    `Priority: ${task.priority}`,
    `Due: ${task.dueDate ?? 'none'}`,
    `Labels: ${task.labels.map((label) => label.name).join(', ') || 'none'}`,
    `Created: ${task.createdAt.toISOString()}`,
    `Updated: ${task.updatedAt.toISOString()}`,
  ]
  if (task.completedAt) {
    fields.push(`Completed: ${task.completedAt.toISOString()}`)
  }
  const sections = [
    `# ${project.key}-${task.number} ${task.title}`,
    list(fields, ''),
    '## Description',
    task.description ?? 'No description',
    '## Subtasks',
    subtasks.length === 0
      ? 'No subtasks'
      : subtasks
          .map((subtask) => `- [${subtask.done ? 'x' : ' '}] ${subtask.title}`)
          .join('\n'),
    '## Comments',
  ]
  if (comments.length === 0) sections.push('No comments')
  for (const comment of comments) {
    sections.push(`### ${comment.createdAt.toISOString()}`, comment.body)
  }
  return `${sections.join('\n\n')}\n`
}
