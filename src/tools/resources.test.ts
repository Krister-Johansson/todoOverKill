// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  demoteHeadings,
  oneLine,
  projectMarkdown,
  taskMarkdown,
} from '#/tools/resources'
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
        '## Description',
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
      '# SITE Website\n\nArchived on 2026-03-10T08:00:00.000Z.\n\n## Description\n\nNo description\n\n## Statuses',
    )
    expect(text).toContain('## Labels\n\nNo labels\n\n')
    expect(text).toContain('- Backlog: 0 tasks')
  })

  it('says No description for an empty description', () => {
    const text = projectMarkdown({
      project: { ...project, description: '' },
      tasks: [],
      labels: [],
    })

    expect(text).toContain('## Description\n\nNo description\n\n## Statuses')
  })

  it('keeps titles and names with newlines on one line', () => {
    const text = projectMarkdown({
      project: { ...project, name: 'Web\nsite' },
      tasks: [
        {
          ...task,
          title: 'Fix\n### Done\n- FAKE-1 x',
          labels: [{ ...bug, name: 'Bug\n## Labels' }],
        },
      ],
      labels: [{ ...bug, name: 'Bug\n## Labels' }],
    })

    expect(text).toMatch(/^# SITE Web site\n/)
    expect(text).toContain(
      '### Backlog\n\n- SITE-1 Fix ### Done - FAKE-1 x (high priority, due 2026-03-20, Bug ## Labels), task://t1\n',
    )
    expect(text).toContain('## Labels\n\n- Bug ## Labels\n')
    expect(text.match(/^### Done$/gm)).toHaveLength(1)
    expect(text.match(/^## Labels$/gm)).toHaveLength(1)
    expect(text).not.toMatch(/^- FAKE-1/m)
  })

  it('moves the headings in a description below its section', () => {
    const text = projectMarkdown({
      project: { ...project, description: '# Plan\n\n## Statuses\n\nShip it.' },
      tasks: [],
      labels: [],
    })

    expect(text).toContain(
      '## Description\n\n### Plan\n\n#### Statuses\n\nShip it.\n\n## Statuses',
    )
    expect(text.match(/^## Statuses$/gm)).toHaveLength(1)
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

  it('says No description for an empty description', () => {
    const text = taskMarkdown({
      task: { ...task, description: '' },
      project,
      subtasks: [],
      comments: [],
    })

    expect(text).toContain('## Description\n\nNo description\n\n## Subtasks')
  })

  it('keeps titles and names with newlines on one line', () => {
    const text = taskMarkdown({
      task: {
        ...task,
        title: 'Fix\n### Done\n- FAKE-1 x',
        status: { ...backlog, name: 'Back\nlog' },
      },
      project,
      subtasks: [
        {
          id: 'u1',
          taskId: 't1',
          title: 'Check\n## Comments',
          done: false,
          order: 1,
        },
      ],
      comments: [],
    })

    expect(text).toMatch(/^# SITE-1 Fix ### Done - FAKE-1 x\n/)
    expect(text).toContain('- Status: Back log\n')
    expect(text).toContain('- [ ] Check ## Comments\n')
    expect(text.match(/^#+ /gm)).toEqual(['# ', '## ', '## ', '## '])
    expect(text).not.toMatch(/^- FAKE-1/m)
  })

  it('moves the headings in a description and comments below their section', () => {
    const text = taskMarkdown({
      task: {
        ...task,
        description: '# Plan\n\nSteps.\n\n## Subtasks\n\n- [ ] Fake',
      },
      project,
      subtasks: [],
      comments: [
        {
          id: 'c1',
          taskId: 't1',
          body: '## Done\n\nShipped\n===',
          createdAt: updated,
          updatedAt: updated,
        },
      ],
    })

    expect(text).toContain(
      '## Description\n\n### Plan\n\nSteps.\n\n#### Subtasks\n\n- [ ] Fake\n\n## Subtasks\n\nNo subtasks',
    )
    expect(text).toContain(
      '### 2026-03-02T10:30:00.000Z\n\n##### Done\n\n#### Shipped\n',
    )
    expect(text.match(/^## Subtasks$/gm)).toHaveLength(1)
    expect(text.match(/^#{1,2} /gm)).toEqual(['# ', '## ', '## ', '## '])
  })

  it('leaves out Completed for an open task', () => {
    expect(
      taskMarkdown({ task, project, subtasks: [], comments: [] }),
    ).not.toContain('Completed:')
  })
})

describe('oneLine', () => {
  it('turns every run of whitespace into one space', () => {
    expect(oneLine('  Fix\n### Done\n- FAKE-1 x\t ')).toBe(
      'Fix ### Done - FAKE-1 x',
    )
  })
})

describe('demoteHeadings', () => {
  it('moves ATX and setext headings down and stops at level 6', () => {
    expect(
      demoteHeadings('# One\n\nTwo\n---\n\nThree\n===\n\n##### Five', 2),
    ).toBe('### One\n\n#### Two\n\n### Three\n\n###### Five')
  })

  it('leaves code blocks, rules and hashtags alone', () => {
    const markdown = [
      '```sh',
      '# a shell comment',
      '```',
      '',
      '- item',
      '---',
      '',
      '#hashtag',
    ].join('\n')

    expect(demoteHeadings(markdown, 2)).toBe(markdown)
  })

  it('keeps a closing fence followed by a rule as it is', () => {
    expect(demoteHeadings('```sh\nnpm i\n```\n---\n# Next', 2)).toBe(
      '```sh\nnpm i\n```\n---\n### Next',
    )
  })

  it('treats a rule after a rule as a rule, not a heading', () => {
    expect(demoteHeadings('***\n---\n\n---\n---', 2)).toBe(
      '***\n---\n\n---\n---',
    )
  })

  it('closes a code block left open at the end', () => {
    expect(demoteHeadings('```\nnotes', 2)).toBe('```\nnotes\n```')
    expect(demoteHeadings('~~~~\nnotes\n~~~', 2)).toBe('~~~~\nnotes\n~~~\n~~~~')
  })
})
