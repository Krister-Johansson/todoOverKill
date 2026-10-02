import type { listComments } from '#/server/comments'
import type { listLabels } from '#/server/labels'
import type { getProject } from '#/server/projects'
import type { listSubtasks } from '#/server/subtasks'
import type { getTask, listTasks } from '#/server/tasks'

// The Markdown the MCP resources project://{id} and task://{id} return (F37).
// Pure functions of what the services return, so the server reads the data
// and these only lay it out. Titles and names go on one line, and descriptions
// and comment bodies stay Markdown with their headings moved below the
// section they sit in, so user text cannot add a section or a task line.

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

/**
 * A title or name on one line: every run of whitespace, newlines included,
 * becomes one space, so it cannot start a heading or list item of its own.
 */
export function oneLine(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const ATX_HEADING = /^ {0,3}(#{1,6})(?=[ \t]|$)/
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/
/** A line that cannot be the text of a setext heading. */
const NOT_PARAGRAPH = /^\s*$|^ {0,3}(#|>|[-*+][ \t]|\d{1,9}[.)][ \t])|^ {4}/

/**
 * Markdown with every heading moved `depth` levels down, as the UI's Markdown
 * renders it under a section heading, so the text's own headings sit below
 * the section's and never read as one of its sections. Levels stop at 6. A
 * setext heading becomes an ATX one, and code blocks are left alone.
 */
export function demoteHeadings(markdown: string, depth: number) {
  const lines = markdown.split('\n')
  const out: Array<string> = []
  let fence: string | undefined
  for (const line of lines) {
    const fenceMatch = FENCE.exec(line)
    if (fence !== undefined) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length &&
        line.trim() === fenceMatch[1]
      ) {
        fence = undefined
      }
      out.push(line)
      continue
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      out.push(line)
      continue
    }
    const heading = ATX_HEADING.exec(line)
    if (heading) {
      const level = Math.min(6, heading[1].length + depth)
      out.push('#'.repeat(level) + line.slice(heading[0].length))
      continue
    }
    const previous = out.at(-1)
    const underline = SETEXT_UNDERLINE.exec(line)
    if (underline && previous !== undefined && !NOT_PARAGRAPH.test(previous)) {
      const level = Math.min(6, (underline[1][0] === '=' ? 1 : 2) + depth)
      out[out.length - 1] = `${'#'.repeat(level)} ${previous.trim()}`
      continue
    }
    out.push(line)
  }
  return out.join('\n')
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
    ...task.labels.map((label) => oneLine(label.name)),
  ].filter((detail) => detail !== undefined)
  const suffix = details.length === 0 ? '' : ` (${details.join(', ')})`
  return `${key}-${task.number} ${oneLine(task.title)}${suffix}, task://${task.id}`
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
  const key = oneLine(project.key)
  const sections = [`# ${key} ${oneLine(project.name)}`]
  if (project.archivedAt) {
    sections.push(`Archived on ${project.archivedAt.toISOString()}.`)
  }
  sections.push(
    '## Description',
    project.description
      ? demoteHeadings(project.description, 2)
      : 'No description',
  )
  const byStatus = project.statuses.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.statusId === status.id),
  }))
  sections.push(
    '## Statuses',
    list(
      byStatus.map(
        ({ status, tasks: inStatus }) =>
          `${oneLine(status.name)}: ${plural(inStatus.length, 'task')}`,
      ),
      'No statuses',
    ),
    '## Labels',
    list(
      labels.map((label) => oneLine(label.name)),
      'No labels',
    ),
    '## Tasks',
  )
  for (const { status, tasks: inStatus } of byStatus) {
    sections.push(
      `### ${oneLine(status.name)}`,
      list(
        inStatus.map((task) => taskLine(key, task)),
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
  const key = oneLine(project.key)
  const labels = task.labels.map((label) => oneLine(label.name))
  const fields = [
    `Project: ${key} ${oneLine(project.name)}, project://${project.id}`,
    `Status: ${oneLine(task.status.name)}`,
    `Priority: ${task.priority}`,
    `Due: ${task.dueDate ?? 'none'}`,
    `Labels: ${labels.join(', ') || 'none'}`,
    `Created: ${task.createdAt.toISOString()}`,
    `Updated: ${task.updatedAt.toISOString()}`,
  ]
  if (task.completedAt) {
    fields.push(`Completed: ${task.completedAt.toISOString()}`)
  }
  const sections = [
    `# ${key}-${task.number} ${oneLine(task.title)}`,
    list(fields, ''),
    '## Description',
    task.description ? demoteHeadings(task.description, 2) : 'No description',
    '## Subtasks',
    subtasks.length === 0
      ? 'No subtasks'
      : subtasks
          .map(
            (subtask) =>
              `- [${subtask.done ? 'x' : ' '}] ${oneLine(subtask.title)}`,
          )
          .join('\n'),
    '## Comments',
  ]
  if (comments.length === 0) sections.push('No comments')
  for (const comment of comments) {
    sections.push(
      `### ${comment.createdAt.toISOString()}`,
      demoteHeadings(comment.body, 3),
    )
  }
  return `${sections.join('\n\n')}\n`
}
