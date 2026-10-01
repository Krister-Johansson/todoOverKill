import { expect, test } from '@playwright/test'

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
  return { name: `${label} ${run}${counter}`, key: `L${run}${counter}` }
}

const db = createTestPrismaClient()
const names: Array<string> = []

/**
 * A project with three tasks whose numbers cross a digit boundary (2, 10,
 * 11), so sorting the key as text would differ from sorting it by number.
 * Board order is Alpha (Backlog), Charlie (Todo), Bravo (Done). Bravo has no
 * due date and Alpha's is long past.
 */
async function seedList(label: string) {
  const { name, key } = unique(label)
  names.push(name)
  const project = await db.project.create({
    data: {
      name,
      key,
      color: '#2563eb',
      nextTaskNumber: 12,
      statuses: {
        create: [
          { name: 'Backlog', order: 1, category: 'todo' },
          { name: 'Todo', order: 2, category: 'todo' },
          { name: 'Done', order: 3, category: 'done' },
        ],
      },
    },
    include: { statuses: true },
  })
  const status = (statusName: string) =>
    project.statuses.find((s) => s.name === statusName)!.id
  const alpha = await db.task.create({
    data: {
      projectId: project.id,
      statusId: status('Backlog'),
      number: 10,
      title: 'Alpha low task',
      priority: 'low',
      dueDate: new Date('2000-01-01T00:00:00.000Z'),
      order: 1,
    },
  })
  const charlie = await db.task.create({
    data: {
      projectId: project.id,
      statusId: status('Todo'),
      number: 11,
      title: 'Charlie urgent task',
      priority: 'urgent',
      dueDate: new Date('2030-06-01T00:00:00.000Z'),
      order: 1,
    },
  })
  const bravo = await db.task.create({
    data: {
      projectId: project.id,
      statusId: status('Done'),
      number: 2,
      title: 'Bravo medium task',
      priority: 'medium',
      order: 1,
    },
  })
  return { project, alpha, bravo, charlie }
}

test.afterAll(async () => {
  // Tasks first: a status with tasks cannot be deleted.
  await db.task.deleteMany({ where: { project: { name: { in: names } } } })
  await db.project.deleteMany({ where: { name: { in: names } } })
  await db.$disconnect()
})

const BOARD_ORDER = [
  'Alpha low task',
  'Charlie urgent task',
  'Bravo medium task',
]

/** Waits for hydration, so clicks and key presses reach React. */
async function openList(page: Page, projectId: string, search = '') {
  await page.goto(`/projects/${projectId}/list${search}`, {
    waitUntil: 'networkidle',
  })
}

function table(page: Page) {
  return page.getByRole('table')
}

function region(page: Page) {
  return page.locator('[aria-label="Task table"]')
}

/** The row links, one per row, in row order. */
function rowLinks(page: Page) {
  return table(page).getByRole('row').getByRole('link')
}

function header(page: Page, name: string) {
  return table(page).getByRole('columnheader', { name })
}

function sortButton(page: Page, name: string) {
  return header(page, name).getByRole('button', { name })
}

function liveRegion(page: Page) {
  return page.locator('[aria-live="polite"]')
}

async function expectNoSort(page: Page) {
  await expect(table(page).locator('th[aria-sort]')).toHaveCount(0)
  await expect(rowLinks(page)).toHaveText(BOARD_ORDER)
}

/**
 * Whether every header button is the topmost element at its centre once
 * scrolled into view, inside the region and the page. A row link's overlay
 * covering one would fail this.
 */
async function headerButtonsUncovered(page: Page) {
  return table(page).evaluate((element) => {
    const buttons = [...element.querySelectorAll('thead button')]
    return (
      buttons.length === 6 &&
      buttons.every((button) => {
        button.scrollIntoView({ block: 'center', inline: 'nearest' })
        const box = button.getBoundingClientRect()
        const x = box.x + box.width / 2
        const y = box.y + box.height / 2
        return document.elementFromPoint(x, y)?.closest('button') === button
      })
    )
  })
}

/** The centre of `target` in the viewport, once scrolled into view. */
async function centreOf(target: Locator) {
  await target.scrollIntoViewIfNeeded()
  const box = (await target.boundingBox())!
  return [box.x + box.width / 2, box.y + box.height / 2] as const
}

/** The tag of the link or button a pointer at (x, y) would hit, if any. */
async function clickableAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) =>
      document.elementFromPoint(px, py)?.closest('a, button')?.tagName,
    [x, y],
  )
}

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((el) => el === document.activeElement)) break
  }
  await expect(target).toBeFocused()
}

test('the project views link to the list, which has a caption and six columns', async ({
  page,
}) => {
  const { project, alpha, bravo, charlie } = await seedList('Columns')
  await page.goto(`/projects/${project.id}/board`, { waitUntil: 'networkidle' })

  const views = page.getByRole('navigation', { name: 'Project views' })
  await expect(views.getByRole('link')).toHaveText(['Board', 'List'])
  await views.getByRole('link', { name: 'List' }).click()

  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/list$`))
  await expect(views.getByRole('link', { name: 'List' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page).toHaveTitle(`${project.name} · todoOverKill`)

  // The caption names the table.
  const caption = table(page).locator('caption')
  await expect(caption).toBeVisible()
  await expect(caption).toHaveText(`${project.name}: 3 tasks`)
  await expect(
    page.getByRole('table', { name: `${project.name}: 3 tasks` }),
  ).toBeVisible()

  const headers = table(page).locator('th[scope="col"]')
  await expect(headers).toHaveText([
    'Key',
    'Title',
    'Status',
    'Priority',
    'Due',
    'Updated',
  ])
  for (const th of await headers.all()) {
    await expect(th.getByRole('button')).toHaveCount(1)
  }

  await expectNoSort(page)
  await expect(rowLinks(page).nth(0)).toHaveAttribute(
    'href',
    `/tasks/${alpha.id}`,
  )
  await expect(rowLinks(page).nth(1)).toHaveAttribute(
    'href',
    `/tasks/${charlie.id}`,
  )
  await expect(rowLinks(page).nth(2)).toHaveAttribute(
    'href',
    `/tasks/${bravo.id}`,
  )

  const alphaRow = table(page).getByRole('row', { name: /Alpha low task/ })
  await expect(alphaRow).toContainText(`${project.key}-10`)
  await expect(alphaRow).toContainText('Backlog')
  await expect(alphaRow).toContainText('Low')
  await expect(alphaRow).toContainText('Jan 1, 2000')
  await expect(alphaRow).toContainText('Overdue')
  await expect(alphaRow.locator('time')).toHaveCount(2)
  const bravoRow = table(page).getByRole('row', { name: /Bravo medium task/ })
  await expect(bravoRow).not.toContainText('Overdue')
  await expect(bravoRow.locator('time')).toHaveCount(1)

  // Pointer targets: the header buttons and the rows, which are the links'
  // click area, are at least 44 px tall.
  for (const button of await table(page).getByRole('button').all()) {
    const box = await button.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
    expect(box?.width).toBeGreaterThanOrEqual(44)
  }
  for (const row of await table(page).locator('tbody tr').all()) {
    const box = await row.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
})

test('the keyboard sorts a column ascending, descending, then back to board order', async ({
  page,
}) => {
  const { project } = await seedList('Keyboard sort')
  await openList(page, project.id)
  await expectNoSort(page)
  expect(new URL(page.url()).search).toBe('')

  const priority = sortButton(page, 'Priority')
  await tabTo(page, priority)

  await page.keyboard.press('Enter')
  await expect(header(page, 'Priority')).toHaveAttribute(
    'aria-sort',
    'ascending',
  )
  await expect(page).toHaveURL(/\?sort=priority&dir=asc$/)
  await expect(rowLinks(page)).toHaveText([
    'Alpha low task',
    'Bravo medium task',
    'Charlie urgent task',
  ])
  await expect(liveRegion(page)).toHaveText('Sorted by Priority, ascending')
  await expect(priority).toBeFocused()

  await page.keyboard.press('Space')
  await expect(header(page, 'Priority')).toHaveAttribute(
    'aria-sort',
    'descending',
  )
  await expect(page).toHaveURL(/\?sort=priority&dir=desc$/)
  await expect(rowLinks(page)).toHaveText([
    'Charlie urgent task',
    'Bravo medium task',
    'Alpha low task',
  ])
  await expect(liveRegion(page)).toHaveText('Sorted by Priority, descending')
  // Only the sorted column reports a sort.
  await expect(table(page).locator('th[aria-sort]')).toHaveCount(1)

  await page.keyboard.press('Enter')
  await expectNoSort(page)
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/list$`))
  await expect(liveRegion(page)).toHaveText('Sorting cleared')
  await expect(priority).toBeFocused()
})

test('a reload keeps the sort, and Back leaves the list instead of stepping through sorts', async ({
  page,
}) => {
  const { project } = await seedList('Reload')
  await page.goto(`/projects/${project.id}/board`, { waitUntil: 'networkidle' })
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'List' })
    .click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/list$`))

  await sortButton(page, 'Priority').click()
  await sortButton(page, 'Priority').click()
  await expect(page).toHaveURL(/\?sort=priority&dir=desc$/)

  await page.reload({ waitUntil: 'networkidle' })
  await expect(header(page, 'Priority')).toHaveAttribute(
    'aria-sort',
    'descending',
  )
  await expect(rowLinks(page)).toHaveText([
    'Charlie urgent task',
    'Bravo medium task',
    'Alpha low task',
  ])

  // The sorts replaced the history entry, so Back returns to the board.
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/board$`))
})

test('an invalid sort in the URL shows board order', async ({ page }) => {
  const { project } = await seedList('Invalid')
  for (const search of [
    '?sort=bogus&dir=asc',
    '?sort=due',
    '?sort=title&dir=sideways',
  ]) {
    await openList(page, project.id, search)
    await expectNoSort(page)
  }
})

test('the key sorts by task number and a missing due date sorts last', async ({
  page,
}) => {
  const { project } = await seedList('Key and due')
  await openList(page, project.id)

  // As text, 10 and 11 would come before 2.
  await sortButton(page, 'Key').click()
  await expect(header(page, 'Key')).toHaveAttribute('aria-sort', 'ascending')
  await expect(table(page).locator('tbody tr abbr')).toHaveText([
    `${project.key}-2`,
    `${project.key}-10`,
    `${project.key}-11`,
  ])
  await expect(liveRegion(page)).toHaveText('Sorted by Key, ascending')

  await sortButton(page, 'Due').click()
  await expect(header(page, 'Due')).toHaveAttribute('aria-sort', 'ascending')
  await expect(header(page, 'Key')).not.toHaveAttribute('aria-sort')
  await expect(page).toHaveURL(/\?sort=due&dir=asc$/)
  await expect(rowLinks(page)).toHaveText([
    'Alpha low task',
    'Charlie urgent task',
    'Bravo medium task',
  ])

  await sortButton(page, 'Due').click()
  await expect(header(page, 'Due')).toHaveAttribute('aria-sort', 'descending')
  await expect(rowLinks(page)).toHaveText([
    'Charlie urgent task',
    'Alpha low task',
    'Bravo medium task',
  ])
})

test('Enter on a row link opens the task', async ({ page }) => {
  const { project, charlie } = await seedList('Enter')
  await openList(page, project.id)

  const link = rowLinks(page).nth(1)
  await tabTo(page, link)
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(new RegExp(`/tasks/${charlie.id}$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `${project.key}-11 Charlie urgent task`,
  )
})

test('a click on a cell outside the link opens the task', async ({ page }) => {
  const { project, bravo } = await seedList('Row click')
  await openList(page, project.id)

  // The Status cell holds no link. The row link's overlay covers it, so a
  // pointer there lands on the link, and the header buttons stay uncovered.
  const row = table(page).getByRole('row', { name: /Bravo medium task/ })
  const statusCell = row.getByRole('cell').nth(2)
  await expect(statusCell).toHaveText('Done')
  await expect(statusCell.getByRole('link')).toHaveCount(0)
  expect(await headerButtonsUncovered(page)).toBe(true)
  const [x, y] = await centreOf(statusCell)
  expect(await clickableAt(page, x, y)).toBe('A')

  // The Key abbr sits above the overlay, so a pointer reaches it and its
  // title, while the Status cell next to it still belongs to the row link.
  const abbr = row.getByRole('cell').first().locator('abbr')
  const [ax, ay] = await centreOf(abbr)
  expect(
    await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.tagName,
      [ax, ay],
    ),
  ).toBe('ABBR')

  await page.mouse.click(x, y)
  await expect(page).toHaveURL(new RegExp(`/tasks/${bravo.id}$`))
})

for (const theme of ['light', 'dark'] as const) {
  test(`the list has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    const { project } = await seedList(`Axe ${theme}`)
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, theme],
    )
    await openList(page, project.id, '?sort=priority&dir=asc')
    await expect(header(page, 'Priority')).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await expectAccessible(page)
  })
}

// 320 CSS px wide is what a 1280 px window shows at 400% zoom. A data table
// keeps its columns (1.4.10 exempts it), so it may scroll inside its region,
// but the page never scrolls sideways.
test('at 320 px the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const { project } = await seedList('Narrow')
  await openList(page, project.id)
  await expect(rowLinks(page)).toHaveCount(3)

  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth)

  // The rows' link overlays reach no further than the table, so they widen
  // neither the region's scroll area nor the page.
  const sizes = await region(page).evaluate((container) => {
    const tableBox = container.querySelector('table')!.getBoundingClientRect()
    const style = getComputedStyle(container)
    return {
      scrollWidth: container.scrollWidth,
      clientWidth: container.clientWidth,
      tableWidth: tableBox.width,
      padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
    }
  })
  expect(sizes.scrollWidth).toBeLessThanOrEqual(
    Math.ceil(sizes.tableWidth + sizes.padding),
  )

  // In the narrow region too, a row's overlay covers its cells and leaves
  // every header button uncovered.
  expect(await headerButtonsUncovered(page)).toBe(true)
  const statusCell = table(page)
    .locator('tbody tr')
    .first()
    .getByRole('cell')
    .nth(2)
  const [sx, sy] = await centreOf(statusCell)
  expect(await clickableAt(page, sx, sy)).toBe('A')

  if (sizes.scrollWidth > sizes.clientWidth) {
    await expect(region(page)).toHaveAttribute('role', 'region')
    await expect(region(page)).toHaveAttribute('tabindex', '0')
    // The region comes before the header buttons and the rows in Tab order.
    await tabTo(page, region(page))
    await page.keyboard.press('Tab')
    await expect(sortButton(page, 'Key')).toBeFocused()
  } else {
    await expect(region(page)).not.toHaveAttribute('tabindex')
  }
  await expectAccessible(page)
})
