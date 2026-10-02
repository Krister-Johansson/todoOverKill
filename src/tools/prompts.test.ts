// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { DashboardTask } from '#/server/dashboard'
import { DAILY_REVIEW_LIMIT, dailyReviewText } from '#/tools/prompts'

const today = '2026-03-15'
const moment = new Date('2026-03-01T09:00:00.000Z')

/** A dashboard task with the fields the prompt reads. */
function dashboardTask(
  number: number,
  overrides: Partial<DashboardTask> = {},
): DashboardTask {
  return {
    id: `t${number}`,
    projectId: 'p1',
    statusId: 's1',
    number,
    title: `Task ${number}`,
    description: null,
    priority: 'medium',
    dueDate: today,
    order: number,
    completedAt: null,
    createdAt: moment,
    updatedAt: moment,
    status: {
      id: 's1',
      projectId: 'p1',
      name: 'Todo',
      order: 1,
      category: 'todo',
    },
    labels: [],
    project: { id: 'p1', name: 'Website', key: 'SITE' },
    ...overrides,
  }
}

describe('dailyReviewText', () => {
  it('says Nothing for empty sections', () => {
    const text = dailyReviewText({ today, dueToday: [], overdue: [] })

    expect(text).toMatch(/^Daily review for 2026-03-15\.\n\n/)
    expect(text).toContain('Due today:\nNothing.\n\nOverdue:\nNothing.')
  })

  it('lists the tasks due today and how late the overdue ones are', () => {
    const text = dailyReviewText({
      today,
      dueToday: [
        dashboardTask(1, { title: 'Fix the header', priority: 'none' }),
      ],
      overdue: [
        dashboardTask(2, { dueDate: '2026-03-14', priority: 'urgent' }),
        // Across the end of February, which a 30 day month would get wrong.
        dashboardTask(3, { dueDate: '2026-02-26' }),
      ],
    })

    expect(text).toContain(
      'Due today (1):\n- SITE-1 Fix the header (Website, no priority, due 2026-03-15), task://t1\n',
    )
    expect(text).toContain(
      'Overdue (2):\n- SITE-2 Task 2 (Website, urgent priority, due 2026-03-14, 1 day late), task://t2\n- SITE-3 Task 3 (Website, medium priority, due 2026-02-26, 17 days late), task://t3\n',
    )
    expect(text).toMatch(/ask me before calling update_task or move_task\.$/)
    expect(text).toContain('task://{id}')
  })

  it(`lists at most ${DAILY_REVIEW_LIMIT} tasks a section and counts the rest`, () => {
    const overdue = Array.from({ length: DAILY_REVIEW_LIMIT + 3 }, (_, index) =>
      dashboardTask(index + 1, { dueDate: '2026-03-01' }),
    )

    const text = dailyReviewText({ today, dueToday: [], overdue })

    expect(text).toContain(`Overdue (${DAILY_REVIEW_LIMIT + 3}):\n`)
    expect(text).toContain(`SITE-${DAILY_REVIEW_LIMIT} `)
    expect(text).not.toContain(`SITE-${DAILY_REVIEW_LIMIT + 1} `)
    expect(text).toContain('\n…and 3 more\n')
  })

  it('stays under 2,000 characters for a few tasks', () => {
    const text = dailyReviewText({
      today,
      dueToday: [dashboardTask(1)],
      overdue: [
        dashboardTask(2, { dueDate: '2026-03-10' }),
        dashboardTask(3, { dueDate: '2026-03-01' }),
      ],
    })

    expect(text.length).toBeLessThan(2000)
  })
})
