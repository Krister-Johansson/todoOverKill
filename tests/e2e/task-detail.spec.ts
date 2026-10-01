import { expect, test } from '@playwright/test'

import { THEME_STORAGE_KEY } from '../../src/lib/theme'
import { createTestPrismaClient } from '../../src/test/db.ts'
import { expectAccessible } from './accessibility'

import type { Page } from '@playwright/test'

// Tests run in parallel against one database, and keys are unique, so every
// project here gets its own name and key.
const run = Math.random().toString(36).slice(2, 6).toUpperCase()
let counter = 0

function unique(label: string) {
  counter += 1
  return { name: `${label} ${run}${counter}`, key: `D${run}${counter}` }
}

const db = createTestPrismaClient()
const names: Array<string> = []

const DESCRIPTION = [
  '# Plan',
  '',
  'Fix it **now**.',
  '',
  '| Step | Owner |',
  '| ---- | ----- |',
  '| One  | Ann   |',
  '',
  '```',
  `const line = '${'x'.repeat(200)}'`,
  '```',
  '',
  '- [x] Found the cause',
  '- [ ] Wrote the fix',
  '',
  '<b>not bold</b>',
  '',
  '<script>alert(1)</script>',
  '',
  '[run](javascript:alert(1)) and [docs](https://example.com/docs)',
].join('\n')

// The title the overdue task was created with: one unbroken word, so the
// 320 px check covers an activity sentence that has to break inside a word.
const FIRST_TITLE = `Ship${'thefix'.repeat(20)}`

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * A project with two labels, an overdue high priority task in Backlog with
 * both labels, a Markdown description and four activity rows, and a
 * completed task in Done with a past due date, no description, no labels and
 * no activity. The task.moved row has no number, as the demo seed writes it.
 */
async function seedTasks(label: string) {
  const { name, key } = unique(label)
  names.push(name)
  const project = await db.project.create({
    data: {
      name,
      key,
      color: '#2563eb',
      nextTaskNumber: 3,
      statuses: {
        create: [
          { name: 'Backlog', order: 1, category: 'todo' },
          { name: 'Done', order: 2, category: 'done' },
        ],
      },
      labels: {
        create: [
          { name: 'Bug', color: '#dc2626' },
          { name: 'Design', color: '#7c3aed' },
        ],
      },
    },
    include: { statuses: true, labels: true },
  })
  const status = (statusName: string) =>
    project.statuses.find((s) => s.name === statusName)!.id
  const overdue = await db.task.create({
    data: {
      projectId: project.id,
      statusId: status('Backlog'),
      number: 1,
      title: 'Ship the overdue fix',
      description: DESCRIPTION,
      priority: 'high',
      dueDate: new Date('2000-01-01T00:00:00.000Z'),
      order: 1,
      labels: {
        create: project.labels.map((projectLabel) => ({
          labelId: projectLabel.id,
        })),
      },
    },
  })
  const now = Date.now()
  const event = (type: string, payload: object, ago: number) => ({
    projectId: project.id,
    taskId: overdue.id,
    type,
    payload,
    createdAt: new Date(now - ago),
  })
  await db.activity.createMany({
    data: [
      event('task.created', { number: 1, title: FIRST_TITLE }, 3 * DAY),
      event(
        'task.updated',
        { number: 1, fields: ['title', 'dueDate'] },
        2 * DAY,
      ),
      event('task.completed', { number: 1 }, 2 * HOUR),
      event('task.moved', { from: 'Done', to: 'Backlog' }, 5 * MINUTE),
    ],
  })
  const completed = await db.task.create({
    data: {
      projectId: project.id,
      statusId: status('Done'),
      number: 2,
      title: 'Close the finished task',
      dueDate: new Date('2000-01-01T00:00:00.000Z'),
      completedAt: new Date('2000-01-02T10:00:00.000Z'),
      order: 1,
    },
  })
  return { project, overdue, completed }
}

test.afterAll(async () => {
  // Tasks first: a status with tasks cannot be deleted.
  await db.task.deleteMany({ where: { project: { name: { in: names } } } })
  await db.project.deleteMany({ where: { name: { in: names } } })
  await db.$disconnect()
})

/** Waits for hydration, so the page is the one React rendered. */
async function openTask(page: Page, taskId: string) {
  await page.goto(`/tasks/${taskId}`, { waitUntil: 'networkidle' })
}

function main(page: Page) {
  return page.getByRole('main')
}

/** The dd after the dt with this text. */
function field(page: Page, term: string) {
  return main(page).locator(`dt:text-is("${term}") + dd`)
}

function description(page: Page) {
  return page.getByRole('region', { name: 'Description' })
}

function activity(page: Page) {
  return page.getByRole('region', { name: 'Activity' })
}

function activitySentences(page: Page) {
  return activity(page).getByRole('listitem').locator('p')
}

async function hasHorizontalPageScroll(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  )
}

test('direct navigation shows every field of the task', async ({ page }) => {
  const { project, overdue } = await seedTasks('Fields')
  await openTask(page, overdue.id)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `${project.key}-1 Ship the overdue fix`,
  )
  await expect(page).toHaveTitle(
    `Ship the overdue fix · ${project.name} · todoOverKill`,
  )

  const reference = field(page, 'Reference').locator('abbr')
  await expect(reference).toHaveText(`${project.key}-1`)
  await expect(reference).toHaveAttribute(
    'title',
    `${project.name} task ${project.key}-1`,
  )
  const projectLink = field(page, 'Project').getByRole('link', {
    name: project.name,
  })
  await expect(projectLink).toHaveAttribute(
    'href',
    `/projects/${project.id}/board`,
  )
  const linkBox = await projectLink.boundingBox()
  expect(linkBox!.height).toBeGreaterThanOrEqual(44)

  await expect(field(page, 'Status')).toHaveText('Backlog')
  await expect(field(page, 'Priority')).toHaveText('High')
  await expect(field(page, 'Due date')).toContainText('Jan 1, 2000')
  await expect(field(page, 'Due date').locator('time')).toHaveAttribute(
    'datetime',
    '2000-01-01',
  )
  await expect(field(page, 'Due date')).toContainText('Overdue')
  await expect(field(page, 'Labels').getByRole('listitem')).toHaveText([
    'Bug',
    'Design',
  ])
  for (const term of ['Created', 'Updated']) {
    await expect(field(page, term).locator('time')).toHaveAttribute(
      'datetime',
      /^\d{4}-\d{2}-\d{2}T/,
    )
  }
  await expect(main(page).locator('dt:text-is("Completed")')).toHaveCount(0)
})

test('the description renders as Markdown', async ({ page }) => {
  const { overdue } = await seedTasks('Markdown')
  await openTask(page, overdue.id)

  await expect(
    page.getByRole('heading', { level: 2, name: 'Description' }),
  ).toBeVisible()
  await expect(
    description(page).getByRole('heading', { level: 3, name: 'Plan' }),
  ).toBeVisible()
  await expect(description(page).locator('strong')).toHaveText('now')
  await expect(description(page).getByRole('table')).toBeVisible()
  await expect(description(page).locator('input')).toHaveCount(0)
  await expect(
    description(page).getByRole('link', { name: 'docs' }),
  ).toHaveAttribute('href', 'https://example.com/docs')
})

test('raw HTML shows as text and javascript: links are not links', async ({
  page,
}) => {
  const { overdue } = await seedTasks('Unsafe')
  const dialogs: Array<string> = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  await openTask(page, overdue.id)

  await expect(description(page)).toContainText('<b>not bold</b>')
  await expect(description(page)).toContainText('<script>alert(1)</script>')
  await expect(description(page).locator('b')).toHaveCount(0)
  await expect(description(page).locator('script')).toHaveCount(0)
  await expect(
    description(page).getByText('run', { exact: true }),
  ).toBeVisible()
  await expect(
    description(page).getByRole('link', { name: 'run' }),
  ).toHaveCount(0)
  await expect(page.locator('a[href^="javascript:" i]')).toHaveCount(0)
  expect(dialogs).toEqual([])
})

test('a completed task is not overdue and says what it lacks', async ({
  page,
}) => {
  const { completed } = await seedTasks('Completed')
  await openTask(page, completed.id)

  await expect(field(page, 'Status')).toHaveText('Done')
  await expect(field(page, 'Due date')).toHaveText('Jan 1, 2000')
  await expect(field(page, 'Completed').locator('time')).toHaveAttribute(
    'datetime',
    '2000-01-02T10:00:00.000Z',
  )
  await expect(field(page, 'Labels')).toHaveText('No labels')
  await expect(description(page)).toContainText('No description')
  await expect(main(page).getByText('Overdue')).toHaveCount(0)
})

test('the activity log reads as sentences with both times', async ({
  page,
}) => {
  const { overdue } = await seedTasks('Activity')
  await openTask(page, overdue.id)

  await expect(
    page.getByRole('heading', { level: 2, name: 'Activity' }),
  ).toBeVisible()
  await expect(activitySentences(page)).toHaveText([
    `Created the task “${FIRST_TITLE}”.`,
    'Changed the title and the due date.',
    'Completed the task.',
    'Moved from Done to Backlog.',
  ])
  const times = activity(page).locator('time')
  await expect(times).toHaveCount(4)
  for (const time of await times.all()) {
    await expect(time).toHaveAttribute(
      'datetime',
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    )
    await expect(time).toBeVisible()
    // The absolute date and time, in the local zone.
    await expect(time).toHaveText(
      /\([A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s[AP]M\)$/,
    )
  }
  await expect(times).toHaveText([
    /^3 days ago /,
    /^2 days ago /,
    /^2 hours ago /,
    /^5 minutes ago /,
  ])
})

test('a task without activity says so', async ({ page }) => {
  const { completed } = await seedTasks('No activity')
  await openTask(page, completed.id)

  await expect(activity(page)).toContainText('No activity yet')
  await expect(activity(page).getByRole('list')).toHaveCount(0)
})

test('a move from the board shows in the log without a reload', async ({
  page,
}) => {
  const { project, overdue } = await seedTasks('Move log')
  const reference = `${project.key}-1`
  // The first visit caches the activity, so the move has to invalidate it.
  await openTask(page, overdue.id)
  await expect(activitySentences(page)).toHaveCount(4)
  await page.evaluate(() => {
    ;(window as { noReload?: boolean }).noReload = true
  })

  await main(page).getByRole('link', { name: project.name }).click()
  await page.getByRole('button', { name: `Move ${reference}` }).click()
  await page.getByRole('menuitemradio', { name: 'Done' }).click()
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    `Moved ${reference} to Done`,
  )
  await page.getByRole('link', { name: new RegExp(`${reference}\\b`) }).click()

  // The log refetches when the page mounts, so this waits for the new row.
  await expect(activitySentences(page).last()).toHaveText(
    'Moved from Backlog to Done.',
  )
  await expect(activitySentences(page)).toHaveCount(5)
  expect(
    await page.evaluate(() => (window as { noReload?: boolean }).noReload),
  ).toBe(true)
})

for (const theme of ['light', 'dark'] as const) {
  test(`the task page has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    const { overdue } = await seedTasks(`Axe ${theme}`)
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await openTask(page, overdue.id)
    await expectAccessible(page)
  })
}

test('at 320 px the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const { overdue } = await seedTasks('Narrow')
  await openTask(page, overdue.id)

  await expect(activitySentences(page).first()).toContainText(FIRST_TITLE)
  expect(await hasHorizontalPageScroll(page)).toBe(false)
  // The long code line scrolls inside its own region, which is then a Tab
  // stop so keyboard users can scroll it.
  const code = description(page).getByRole('region', { name: 'Code block' })
  await expect(code).toHaveAttribute('tabindex', '0')
  expect(
    await code.evaluate((region) => region.scrollWidth > region.clientWidth),
  ).toBe(true)
  await expectAccessible(page)
})

test('description lines are capped below 80 characters', async ({ page }) => {
  const { overdue } = await seedTasks('Prose')
  await openTask(page, overdue.id)

  const prose = description(page).locator('div.max-w-prose')
  const widths = await prose.evaluate((element) => {
    const style = getComputedStyle(element)
    const probe = document.createElement('span')
    probe.textContent = '0'.repeat(80)
    probe.style.font = style.font
    probe.style.whiteSpace = 'nowrap'
    document.body.append(probe)
    const eighty = probe.getBoundingClientRect().width
    probe.remove()
    return { eighty, width: element.clientWidth }
  })
  // The page is wider than 80 characters here, so the cap is what limits it.
  expect(
    await main(page).evaluate((element) => element.clientWidth),
  ).toBeGreaterThan(widths.eighty)
  expect(widths.width).toBeLessThan(widths.eighty)
})

test('description spacing meets 1.4.8', async ({ page }) => {
  const { overdue } = await seedTasks('Spacing')
  await openTask(page, overdue.id)

  const prose = description(page).locator('div.max-w-prose')
  const spacing = await prose.evaluate((element) => {
    const lineHeight = (block: Element) => {
      const style = getComputedStyle(block)
      return {
        ratio: parseFloat(style.lineHeight) / parseFloat(style.fontSize),
        pixels: parseFloat(style.lineHeight),
      }
    }
    const paragraphs = [...element.querySelectorAll(':scope > p')]
    return {
      ratios: [...paragraphs, element.querySelector('pre')!].map(
        (block) => lineHeight(block).ratio,
      ),
      gaps: paragraphs
        .filter((paragraph) => paragraph.nextElementSibling)
        .map((paragraph) => ({
          gap:
            paragraph.nextElementSibling!.getBoundingClientRect().top -
            paragraph.getBoundingClientRect().bottom,
          lineHeight: lineHeight(paragraph).pixels,
        })),
    }
  })

  for (const ratio of spacing.ratios) expect(ratio).toBeGreaterThanOrEqual(1.5)
  expect(spacing.gaps.length).toBeGreaterThan(0)
  for (const { gap, lineHeight } of spacing.gaps) {
    expect(gap).toBeGreaterThanOrEqual(1.5 * lineHeight)
  }
})
