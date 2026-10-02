import { expect, test } from '@playwright/test'

import { toCalendarDay } from '../../src/lib/dates'
import { THEME_STORAGE_KEY } from '../../src/lib/theme'
import { createTestPrismaClient } from '../../src/test/db.ts'
import { expectAccessible } from './accessibility'

import type { Locator, Page } from '@playwright/test'

// Tests run in parallel against one database, and keys are unique, so every
// project here gets its own name and key.
const run = Math.random().toString(36).slice(2, 6).toUpperCase()
let counter = 0

function unique(label: string) {
  counter += 1
  return { name: `${label} ${run}${counter}`, key: `F${run}${counter}` }
}

const db = createTestPrismaClient()
const names: Array<string> = []

/** `days` after today, local, as UTC midnight: how a due date is stored. */
function dueIn(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return new Date(`${toCalendarDay(date)}T00:00:00.000Z`)
}

/**
 * A project with Backlog, In progress and Done and two labels, Bug and Docs.
 * Backlog holds KEY-1 (high, due yesterday, Bug), KEY-2 (low, no due date)
 * and KEY-3 (high, due today, Docs) in that order. In progress holds KEY-4
 * (medium, due in three days, Bug); Done holds KEY-5 (no priority, due in ten
 * days).
 */
async function seedProject(label: string) {
  const { name, key } = unique(label)
  names.push(name)
  const project = await db.project.create({
    data: {
      name,
      key,
      color: '#2563eb',
      nextTaskNumber: 6,
      statuses: {
        create: [
          { name: 'Backlog', order: 1, category: 'todo' },
          { name: 'In progress', order: 2, category: 'in_progress' },
          { name: 'Done', order: 3, category: 'done' },
        ],
      },
      labels: {
        create: [
          { name: 'Bug', color: '#dc2626' },
          { name: 'Docs', color: '#2563eb' },
        ],
      },
    },
    include: { statuses: true, labels: true },
  })
  const status = (statusName: string) =>
    project.statuses.find((s) => s.name === statusName)!
  const labelId = (labelName: string) =>
    project.labels.find((l) => l.name === labelName)!.id
  const tasks = [
    {
      number: 1,
      title: 'Write the login page',
      status: 'Backlog',
      priority: 'high',
      dueDate: dueIn(-1),
      labels: ['Bug'],
    },
    { number: 2, title: 'Plan the sprint', status: 'Backlog', priority: 'low' },
    {
      number: 3,
      title: 'Fix the signup form',
      status: 'Backlog',
      priority: 'high',
      dueDate: dueIn(0),
      labels: ['Docs'],
    },
    {
      number: 4,
      title: 'Review the copy',
      status: 'In progress',
      priority: 'medium',
      dueDate: dueIn(3),
      labels: ['Bug'],
    },
    {
      number: 5,
      title: 'Ship the release notes',
      status: 'Done',
      priority: 'none',
      dueDate: dueIn(10),
    },
  ] as const
  for (const [index, task] of tasks.entries()) {
    const created = await db.task.create({
      data: {
        projectId: project.id,
        statusId: status(task.status).id,
        number: task.number,
        title: task.title,
        priority: task.priority,
        dueDate: 'dueDate' in task ? task.dueDate : null,
        order: index + 1,
      },
    })
    for (const labelName of 'labels' in task ? task.labels : []) {
      await db.taskLabel.create({
        data: { taskId: created.id, labelId: labelId(labelName) },
      })
    }
  }
  return { project, key, status }
}

test.afterAll(async () => {
  // Tasks first: a status with tasks cannot be deleted.
  await db.task.deleteMany({ where: { project: { name: { in: names } } } })
  await db.project.deleteMany({ where: { name: { in: names } } })
  await db.$disconnect()
})

/** Waits for hydration, so key presses reach React. */
async function open(
  page: Page,
  projectId: string,
  view: 'board' | 'list',
  search = '',
) {
  await page.goto(`/projects/${projectId}/${view}${search}`, {
    waitUntil: 'networkidle',
  })
}

function bar(page: Page) {
  return page.getByRole('form', { name: 'Filter tasks' })
}

function field(page: Page, name: string) {
  return bar(page).getByRole('combobox', { name })
}

function textField(page: Page) {
  return bar(page).getByRole('searchbox', { name: 'Text' })
}

function clearButton(page: Page) {
  return bar(page).getByRole('button', { name: 'Clear filters' })
}

function liveRegion(page: Page) {
  return page.locator('[aria-live="polite"]')
}

function column(page: Page, name: string) {
  return page.getByRole('region', { name: new RegExp(`^${name}`) })
}

function menu(page: Page) {
  return page.getByRole('menu')
}

/** The task references shown in `scope`, in order. */
async function references(scope: Locator) {
  return scope
    .getByRole('link')
    .evaluateAll((links) =>
      links
        .map((link) => link.querySelector('abbr')?.textContent)
        .filter(Boolean),
    )
}

function boardCards(page: Page) {
  return page.getByRole('region', { name: 'Board columns' })
}

function urlSearch(page: Page) {
  return Object.fromEntries(new URL(page.url()).searchParams)
}

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((el) => el === document.activeElement)) break
  }
  await expect(target).toBeFocused()
}

/**
 * Picks an option by keyboard: Tab to the select, then type the start of
 * the option's text, which selects it without opening the list.
 */
async function pick(page: Page, name: string, typed: string, option: string) {
  const select = field(page, name)
  await tabTo(page, select)
  await page.keyboard.type(typed)
  await expect(select.locator('option:checked')).toHaveText(option)
}

/** Counts the server function requests the page sends from now on. */
function countServerRequests(page: Page) {
  const urls: Array<string> = []
  page.on('request', (request) => {
    if (request.url().includes('/_serverFn')) urls.push(request.url())
  })
  return urls
}

/** Records every message the live region shows from now on, in order. */
async function recordAnnouncements(page: Page) {
  await page.evaluate(() => {
    const region = document.querySelector('[aria-live="polite"]')!
    const said: Array<string> = []
    Object.assign(window, { said })
    new MutationObserver(() => {
      const text = region.textContent
      if (text) said.push(text)
    }).observe(region, { childList: true, characterData: true, subtree: true })
  })
}

function announcements(page: Page) {
  return page.evaluate(() => (window as unknown as { said: Array<string> }).said)
}

/** Counts the history entries the router pushes or replaces from now on. */
async function recordNavigations(page: Page) {
  await page.evaluate(() => {
    const navigations = { count: 0 }
    Object.assign(window, { navigations })
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history)
      history[method] = (...args) => {
        navigations.count += 1
        original(...args)
      }
    }
  })
}

function navigations(page: Page) {
  return page.evaluate(
    () => (window as unknown as { navigations: { count: number } }).navigations
      .count,
  )
}

/** Waits for the open animation, so key presses and axe see the final frame. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}

async function openMenu(page: Page, reference: string) {
  await settle(page)
  await page.getByRole('button', { name: `Move ${reference}` }).focus()
  await page.keyboard.press('Enter')
  await expect(menu(page)).toBeVisible()
  await settle(page)
  await expect(
    menu(page).getByRole('menuitemradio', { name: 'Backlog' }),
  ).toBeFocused()
}

test('a status picked by keyboard filters the board without a refetch', async ({
  page,
}) => {
  const { project, key, status } = await seedProject('Status')
  await open(page, project.id, 'board')
  const requests = countServerRequests(page)

  await pick(page, 'Status', 'i', 'In progress')
  await expect(page).toHaveURL(/status=/)
  expect(urlSearch(page)).toEqual({ status: status('In progress').id })
  await expect.poll(() => references(boardCards(page))).toEqual([`${key}-4`])
  await expect(liveRegion(page)).toHaveText('Showing 1 of 5 tasks')
  await expect(bar(page)).toContainText('Showing 1 of 5 tasks')
  await expect(column(page, 'Backlog')).toContainText('No matching tasks')
  await expect(column(page, 'Backlog')).toContainText('0 of 3 tasks')
  // Filtering happens on the cached tasks, so no loader fetched anything.
  expect(requests).toEqual([])
})

test('text applies on Enter, and a reload keeps the filters and the bar', async ({
  page,
}) => {
  const { project, key } = await seedProject('Text')
  await open(page, project.id, 'list')
  const requests = countServerRequests(page)

  await pick(page, 'Priority', 'h', 'High')
  await tabTo(page, textField(page))
  await page.keyboard.type('LOGIN')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/q=LOGIN/)
  expect(urlSearch(page)).toEqual({ priority: 'high', q: 'LOGIN' })
  await expect(liveRegion(page)).toHaveText('Showing 1 of 5 tasks')
  await expect(page.getByRole('table').getByRole('link')).toHaveText([
    'Write the login page',
  ])
  expect(requests).toEqual([])

  await page.reload({ waitUntil: 'networkidle' })
  await expect(field(page, 'Priority')).toHaveValue('high')
  await expect(textField(page)).toHaveValue('LOGIN')
  await expect(bar(page)).toContainText('Showing 1 of 5 tasks')
  await expect(page.getByRole('table').getByRole('link')).toHaveText([
    'Write the login page',
  ])

  await open(page, project.id, 'board', '?label=nope&due=overdue')
  await expect.poll(() => references(boardCards(page))).toEqual([`${key}-1`])
})

test('the label and due filters match on the board', async ({ page }) => {
  const { project, key } = await seedProject('Label due')
  await open(page, project.id, 'board')

  await pick(page, 'Label', 'b', 'Bug')
  await expect
    .poll(() => references(boardCards(page)))
    .toEqual([`${key}-1`, `${key}-4`])
  await pick(page, 'Due', 'o', 'Overdue')
  await expect.poll(() => references(boardCards(page))).toEqual([`${key}-1`])
  expect(urlSearch(page)).toMatchObject({ due: 'overdue' })
})

test('Clear filters removes every filter param and shows all tasks', async ({
  page,
}) => {
  const { project, key } = await seedProject('Clear')
  await open(page, project.id, 'board', '?priority=high&due=overdue&q=login')
  await expect.poll(() => references(boardCards(page))).toEqual([`${key}-1`])

  await tabTo(page, clearButton(page))
  await page.keyboard.press('Enter')
  await expect.poll(() => urlSearch(page)).toEqual({})
  await expect(liveRegion(page)).toHaveText('Showing all 5 tasks')
  await expect.poll(() => references(boardCards(page))).toHaveLength(5)
  await expect(textField(page)).toHaveValue('')
  // Focus stays on the button, which is now aria-disabled, not disabled.
  await expect(clearButton(page)).toBeFocused()
  await expect(clearButton(page)).toHaveAttribute('aria-disabled', 'true')
})

test('the list keeps its sort on a filter change and on Clear', async ({
  page,
}) => {
  const { project } = await seedProject('Sort')
  await open(page, project.id, 'list', '?sort=title&dir=asc')

  await pick(page, 'Priority', 'h', 'High')
  await expect(page).toHaveURL(/priority=high/)
  expect(urlSearch(page)).toEqual({
    sort: 'title',
    dir: 'asc',
    priority: 'high',
  })
  await expect(page.getByRole('table').getByRole('link')).toHaveText([
    'Fix the signup form',
    'Write the login page',
  ])

  await tabTo(page, clearButton(page))
  await page.keyboard.press('Enter')
  await expect
    .poll(() => urlSearch(page))
    .toEqual({ sort: 'title', dir: 'asc' })
  await expect(page.getByRole('table').getByRole('link')).toHaveCount(5)

  await open(page, project.id, 'list', '?q=nothing-matches')
  await expect(page.getByText('No tasks match the filters')).toBeVisible()
  await expect(bar(page)).toBeVisible()
})

test('switching views keeps the filters, and the board drops the sort', async ({
  page,
}) => {
  const { project } = await seedProject('Views')
  const views = page.getByRole('navigation', { name: 'Project views' })
  await open(page, project.id, 'board', '?priority=high')

  await views.getByRole('link', { name: 'List' }).click()
  await expect(page).toHaveURL(/\/list\?/)
  expect(urlSearch(page)).toEqual({ priority: 'high' })
  await expect(page.getByRole('table').getByRole('link')).toHaveCount(2)

  await open(page, project.id, 'list', '?priority=high&sort=key&dir=desc')
  await views.getByRole('link', { name: 'Board' }).click()
  await expect(page).toHaveURL(/\/board\?/)
  expect(urlSearch(page)).toEqual({ priority: 'high' })
  await expect(field(page, 'Priority')).toHaveValue('high')
})

test('an invalid filter in the URL shows every task', async ({ page }) => {
  const { project } = await seedProject('Invalid')
  await open(page, project.id, 'board', '?priority=huge&due=soon')
  await expect.poll(() => references(boardCards(page))).toHaveLength(5)
  await expect(field(page, 'Priority')).toHaveValue('')
  await expect(field(page, 'Due')).toHaveValue('')
  await expect(clearButton(page)).toHaveAttribute('aria-disabled', 'true')

  await open(page, project.id, 'list', '?priority=huge&due=soon')
  await expect(page.getByRole('table').getByRole('link')).toHaveCount(5)
})

test('Clear filters removes a status or label the project does not have', async ({
  page,
}) => {
  const { project } = await seedProject('Stale')
  const label = await db.label.create({
    data: { projectId: project.id, name: 'Gone', color: '#2563eb' },
  })
  await db.label.delete({ where: { id: label.id } })
  await open(page, project.id, 'board', `?status=gone&label=${label.id}`)
  await expect.poll(() => references(boardCards(page))).toHaveLength(5)
  await expect(field(page, 'Status')).toHaveValue('')
  await expect(field(page, 'Label')).toHaveValue('')

  await tabTo(page, clearButton(page))
  await expect(clearButton(page)).toHaveAttribute('aria-disabled', 'false')
  await page.keyboard.press('Enter')
  await expect.poll(() => urlSearch(page)).toEqual({})
  await expect(liveRegion(page)).toHaveText('Showing all 5 tasks')
})

test('Escape in the text field removes the text filter', async ({ page }) => {
  const { project } = await seedProject('Escape')
  await open(page, project.id, 'list', '?priority=high&q=login')
  await expect(page.getByRole('table').getByRole('link')).toHaveCount(1)

  await tabTo(page, textField(page))
  await page.keyboard.press('Escape')
  await expect(textField(page)).toHaveValue('')
  await expect.poll(() => urlSearch(page)).toEqual({ priority: 'high' })
  await expect(liveRegion(page)).toHaveText('Showing 2 of 5 tasks')
  await expect(page.getByRole('table').getByRole('link')).toHaveCount(2)
  await expect(textField(page)).toBeFocused()

  // Text typed but not applied goes when a select applies a change.
  await page.keyboard.type('signup')
  await pick(page, 'Due', 'o', 'Overdue')
  await expect
    .poll(() => urlSearch(page))
    .toEqual({
      priority: 'high',
      due: 'overdue',
    })
  await expect(textField(page)).toHaveValue('')
})

test('Move up and Move down under a filter use the place in the whole column', async ({
  page,
}) => {
  const { project, key } = await seedProject('Move')
  await open(page, project.id, 'board', '?priority=high')
  const requests = countServerRequests(page)
  const backlog = column(page, 'Backlog')
  await expect.poll(() => references(backlog)).toEqual([`${key}-1`, `${key}-3`])
  await expect(backlog).toContainText('2 of 3 tasks')

  // KEY-1 is the last card shown but not the last in Backlog.
  await openMenu(page, `${key}-1`)
  await expect(
    menu(page).getByRole('menuitem', { name: 'Move down' }),
  ).not.toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()

  // KEY-3 is third in Backlog, so Move up puts it second, above KEY-2.
  await openMenu(page, `${key}-3`)
  await page.keyboard.press('End')
  await expect(
    menu(page).getByRole('menuitem', { name: 'Move up' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(liveRegion(page)).toHaveText(`Moved ${key}-3 up`)
  // The move is a server function call, so the counter the other tests
  // expect to stay empty does see these requests.
  expect(requests.length).toBeGreaterThan(0)

  await clearButton(page).focus()
  await page.keyboard.press('Enter')
  await expect
    .poll(() => references(backlog))
    .toEqual([`${key}-1`, `${key}-3`, `${key}-2`])

  await page.reload({ waitUntil: 'networkidle' })
  await expect
    .poll(() => references(column(page, 'Backlog')))
    .toEqual([`${key}-1`, `${key}-3`, `${key}-2`])
})

test('a card moved out of the filter leaves focus on the results line', async ({
  page,
}) => {
  const { project, key, status } = await seedProject('Move out')
  await open(page, project.id, 'board', `?status=${status('Backlog').id}`)
  await expect.poll(() => references(boardCards(page))).toHaveLength(3)
  await recordAnnouncements(page)

  await openMenu(page, `${key}-1`)
  await page.keyboard.press('ArrowDown')
  await expect(
    menu(page).getByRole('menuitemradio', { name: 'In progress' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')

  const results = bar(page).getByText('Showing 2 of 5 tasks')
  await expect(results).toBeFocused()
  await expect
    .poll(() => references(boardCards(page)))
    .toEqual([`${key}-2`, `${key}-3`])
  await expect
    .poll(() => announcements(page))
    .toEqual([`Moved ${key}-1 to In progress`, 'Showing 2 of 5 tasks'])
  await expect(results).toBeFocused()
})

test('a project switch without filters says no count and keeps focus', async ({
  page,
}) => {
  const first = await seedProject('Switch from')
  const second = await seedProject('Switch to')
  await db.task.deleteMany({
    where: { projectId: second.project.id, number: { in: [4, 5] } },
  })
  await open(page, first.project.id, 'board')
  await expect.poll(() => references(boardCards(page))).toHaveLength(5)
  await recordAnnouncements(page)

  // Leaves focus on the page, as an unmounted Move button would, so a wrong
  // focus move to the results line would show.
  await page.evaluate((id) => {
    const link = document.getElementById(id)!
    link.click()
    link.blur()
  }, `sidebar-project-${second.project.id}`)
  await expect(
    page.getByRole('heading', { level: 1, name: second.project.name }),
  ).toBeVisible()
  await expect.poll(() => references(boardCards(page))).toHaveLength(3)
  await expect(bar(page)).toContainText('Showing all 3 tasks')
  // Longer than the board waits before it says a count.
  await page.waitForTimeout(1500)
  expect(await announcements(page)).toEqual([])
  expect(await page.evaluate(() => document.activeElement === document.body))
    .toBe(true)
})

test('text typed but not applied stays with its project', async ({ page }) => {
  const first = await seedProject('Draft from')
  const second = await seedProject('Draft to')
  await open(page, first.project.id, 'board')
  await textField(page).fill('login')
  await expect(clearButton(page)).toHaveAttribute('aria-disabled', 'false')

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: second.project.name })
    .click()
  await expect(
    page.getByRole('heading', { level: 1, name: second.project.name }),
  ).toBeVisible()
  await expect(textField(page)).toHaveValue('')
  await expect(clearButton(page)).toHaveAttribute('aria-disabled', 'true')

  // Going two steps back moves the list from one project to the other
  // without leaving it.
  await open(page, first.project.id, 'list')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: second.project.name })
    .click()
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'List' })
    .click()
  await expect(page).toHaveURL(new RegExp(`${second.project.id}/list`))
  await textField(page).fill('login')
  await page.evaluate(() => history.go(-2))
  await expect(page).toHaveURL(new RegExp(`${first.project.id}/list`))
  await expect(
    page.getByRole('heading', { level: 1, name: first.project.name }),
  ).toBeVisible()
  await expect(textField(page)).toHaveValue('')
  await expect(clearButton(page)).toHaveAttribute('aria-disabled', 'true')
})

test('text that looks like a number still filters', async ({ page }) => {
  const { project, key, status } = await seedProject('Number')
  await db.task.create({
    data: {
      projectId: project.id,
      statusId: status('Backlog').id,
      number: 6,
      title: 'Plan the 2026 roadmap',
      order: 6,
    },
  })
  await open(page, project.id, 'board', '?q=2026')
  await expect.poll(() => references(boardCards(page))).toEqual([`${key}-6`])
  await expect(textField(page)).toHaveValue('2026')
  await expect(bar(page)).toContainText('Showing 1 of 6 tasks')

  await open(page, project.id, 'list')
  await tabTo(page, textField(page))
  await page.keyboard.type('2026')
  await page.keyboard.press('Enter')
  await expect(liveRegion(page)).toHaveText('Showing 1 of 6 tasks')
  await expect(page.getByRole('table').getByRole('link')).toHaveText([
    'Plan the 2026 roadmap',
  ])
  await page.reload({ waitUntil: 'networkidle' })
  await expect(textField(page)).toHaveValue('2026')
  await expect(page.getByRole('table').getByRole('link')).toHaveText([
    'Plan the 2026 roadmap',
  ])
})

test('Enter in an emptied text field applies the change once', async ({
  page,
}) => {
  const { project } = await seedProject('Enter once')
  await open(page, project.id, 'list', '?q=login')
  await expect(page.getByRole('table').getByRole('link')).toHaveCount(1)
  await tabTo(page, textField(page))
  await recordAnnouncements(page)
  await recordNavigations(page)

  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Enter')
  await expect.poll(() => urlSearch(page)).toEqual({})
  await expect(page.getByRole('table').getByRole('link')).toHaveCount(5)
  await expect.poll(() => announcements(page)).toEqual(['Showing all 5 tasks'])
  expect(await navigations(page)).toBe(1)
  await expect(textField(page)).toBeFocused()
})

for (const theme of ['light', 'dark'] as const) {
  test(`filtered board and list have no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    const { project } = await seedProject(`Axe ${theme}`)
    await page.addInitScript(
      ([storageKey, value]) => localStorage.setItem(storageKey, value),
      [THEME_STORAGE_KEY, theme],
    )
    await open(page, project.id, 'board', '?priority=high&q=fix')
    await expect(bar(page)).toContainText('Showing 1 of 5 tasks')
    await expectAccessible(page)

    await open(page, project.id, 'list', '?label=nope&due=today')
    await expect(bar(page)).toContainText('Showing 1 of 5 tasks')
    await expectAccessible(page)
  })
}

test('filter controls are at least 44 px tall', async ({ page }) => {
  const { project } = await seedProject('Targets')
  await open(page, project.id, 'board')
  const controls = bar(page).locator('select, input, button')
  await expect(controls).toHaveCount(7)
  for (const control of await controls.all()) {
    const box = await control.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
})

// 320 CSS px wide is what a 1280 px window shows at 400% zoom.
test('the filtered views fit at 320 px without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const { project } = await seedProject('Narrow')
  for (const view of ['board', 'list'] as const) {
    await open(page, project.id, view, '?priority=high&q=the')
    await expect(bar(page)).toBeVisible()
    const scrolls = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    )
    expect(scrolls).toBe(false)
  }
})
