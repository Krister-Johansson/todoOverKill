// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { projectMarkdown, taskMarkdown } from '#/tools/resources'
import type { ProjectMarkdownInput, TaskMarkdownInput } from '#/tools/resources'

// Pure functions, so the rows are built by hand rather than read from the
// database.

const created = new Date('2026-03-01T09:00:00.000Z')
const updated = new Date('2026-03-02T10:30:00.000Z')

const backlog = {
  id: 's1',
  projectId: 'p1',
  name: 'Backlog',
  order: 1,
  category: 'todo' as const,
}
const done = {
  ...backlog,
  id: 's2',
  name: 'Done',
  order: 2,
  category: 'done' as const,
}
const review = { ...backlog, id: 's3', name: 'Review', order: 3 }

const project: TaskMarkdownInput['project'] = {
  id: 'p1',
  name: 'Website',
  key: 'SITE',
  description: 'The public site.',
  color: null,
  nextTaskNumber: 3,
  archivedAt: null,
  createdAt: created,
  updatedAt: created,
  statuses: [backlog, done, review],
}

const bug = { id: 'l1', projectId: 'p1', name: 'Bug', color: '#dc2626' }
const ux = { id: 'l2', projectId: 'p1', name: 'UX', color: '#2563eb' }

const task: TaskMarkdownInput['task'] = {
  id: 't1',
  projectId: 'p1',
  statusId: 's1',
  number: 1,
  title: 'Fix the header',
  description: 'The logo **overlaps** the menu.',
  priority: 'high',
  dueDate: '2026-03-20',
  order: 1,
  completedAt: null,
  createdAt: created,
  updatedAt: updated,
  status: backlog,
  labels: [bug, ux],
}

const shipped: TaskMarkdownInput['task'] = {
  ...task,
  id: 't2',
  statusId: 's2',
  number: 2,
  title: 'Ship the footer',
  description: null,
  priority: 'none',
  dueDate: null,
  completedAt: updated,
  status: done,
  labels: [],
}

describe('projectMarkdown', () => {
  const input: ProjectMarkdownInput = {
    project,
    tasks: [task, shipped],
    labels: [bug, ux],
  }

  it('lists the statuses, labels, and tasks under their status', () => {
    expect(projectMarkdown(input)).toBe(
      [
        '# SITE Website',
        '',
        'The public site.',
        '',
        '## Statuses',
        '',
        '- Backlog: 1 task',
        '- Done: 1 task',
        '- Review: 0 tasks',
        '',
        '## Labels',
        '',
        '- Bug',
        '- UX',
        '',
        '## Tasks',
        '',
        '### Backlog',
        '',
        '- SITE-1 Fix the header (high priority, due 2026-03-20, Bug, UX), task://t1',
        '',
        '### Done',
        '',
        '- SITE-2 Ship the footer, task://t2',
        '',
        '### Review',
        '',
        'No tasks',
        '',
      ].join('\n'),
    )
  })

  it('says when there is no description or label, and when it was archived', () => {
    const text = projectMarkdown({
      project: {
        ...project,
        description: null,
        archivedAt: new Date('2026-03-10T08:00:00.000Z'),
      },
      tasks: [],
      labels: [],
    })

    expect(text).toContain(
      '# SITE Website\n\nNo description\n\nArchived on 2026-03-10T08:00:00.000Z.\n\n## Statuses',
    )
    expect(text).toContain('## Labels\n\nNo labels\n\n')
    expect(text).toContain('- Backlog: 0 tasks')
  })
})

describe('taskMarkdown', () => {
  it('gives the fields, description, subtasks, and comments', () => {
    expect(
      taskMarkdown({
        task,
        project,
        subtasks: [
          {
            id: 'u1',
            taskId: 't1',
            title: 'Check the logo',
            done: false,
            order: 1,
          },
          {
            id: 'u2',
            taskId: 't1',
            title: 'Measure the menu',
            done: true,
            order: 2,
          },
        ],
        comments: [
          {
            id: 'c1',
            taskId: 't1',
            body: 'Looks good on *mobile*.',
            createdAt: updated,
            updatedAt: updated,
          },
        ],
      }),
    ).toBe(
      [
        '# SITE-1 Fix the header',
        '',
        '- Project: SITE Website, project://p1',
        '- Status: Backlog',
        '- Priority: high',
        '- Due: 2026-03-20',
        '- Labels: Bug, UX',
        '- Created: 2026-03-01T09:00:00.000Z',
        '- Updated: 2026-03-02T10:30:00.000Z',
        '',
        '## Description',
        '',
        'The logo **overlaps** the menu.',
        '',
        '## Subtasks',
        '',
        '- [ ] Check the logo',
        '- [x] Measure the menu',
        '',
        '## Comments',
        '',
        '### 2026-03-02T10:30:00.000Z',
        '',
        'Looks good on *mobile*.',
        '',
      ].join('\n'),
    )
  })

  it('says none for an empty due date and labels, and adds the completion', () => {
    const text = taskMarkdown({
      task: shipped,
      project,
      subtasks: [],
      comments: [],
    })

    expect(text).toContain('# SITE-2 Ship the footer\n')
    expect(text).toContain('- Due: none\n')
    expect(text).toContain('- Labels: none\n')
    expect(text).toContain('- Priority: none\n')
    expect(text).toContain('- Completed: 2026-03-02T10:30:00.000Z\n')
    expect(text).toContain('## Description\n\nNo description\n')
    expect(text).toContain('## Subtasks\n\nNo subtasks\n')
    expect(text).toMatch(/## Comments\n\nNo comments\n$/)
  })

  it('leaves out Completed for an open task', () => {
    expect(
      taskMarkdown({ task, project, subtasks: [], comments: [] }),
    ).not.toContain('Completed:')
  })
})
