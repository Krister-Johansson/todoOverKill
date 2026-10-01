// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it } from 'vitest'

import type { Prisma } from '#/generated/prisma/client'
import { db } from '#/server/db'
import { ConflictError, NotFoundError } from '#/server/errors'
import { archiveProject, createProject } from '#/server/projects'
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  moveTask,
  updateTask,
} from '#/server/tasks'
import { resetDatabase } from '#/test/db'

const UNKNOWN_ID = 'no-such-id'

beforeEach(() => resetDatabase(db))

/** A project with Backlog, Todo, In progress, and Done. */
function createWebsite() {
  return createProject({ name: 'Website', key: 'WEB' })
}

function createLabel(projectId: string, name: string) {
  return db.label.create({ data: { projectId, name, color: '#1d4ed8' } })
}

/** Runs `action` and returns the activity rows it added to the project. */
async function newActivity(projectId: string, action: () => Promise<unknown>) {
  const before = await db.activity.findMany({
    where: { projectId },
    select: { id: true },
  })
  const seen = new Set(before.map((row) => row.id))
  await action()
  const after = await db.activity.findMany({
    where: { projectId },
    select: { id: true, type: true, payload: true, taskId: true },
  })
  return after.filter((row) => !seen.has(row.id)).map(({ id, ...row }) => row)
}

/** Task titles of one status, top to bottom. */
async function columnOf(statusId: string) {
  const tasks = await db.task.findMany({
    where: { statusId },
    orderBy: { order: 'asc' },
    select: { title: true },
  })
  return tasks.map((task) => task.title)
}

/**
 * Runs `action` while another transaction deletes the task. The action reads
 * the task, which the uncommitted delete does not hide, then waits on the row
 * lock when it writes, and finds the row gone once the delete commits.
 */
function deleteDuring(taskId: string, action: () => Promise<unknown>) {
  return whileDeleting(
    (tx) => tx.task.delete({ where: { id: taskId } }),
    action,
  )
}

/**
 * Runs `action` while another transaction deletes the label. The action finds
 * the label, then waits on its row lock when the TaskLabel foreign key checks
 * it, and finds it gone once the delete commits.
 */
function deleteLabelDuring(labelId: string, action: () => Promise<unknown>) {
  return whileDeleting(
    (tx) => tx.label.delete({ where: { id: labelId } }),
    action,
  )
}

async function whileDeleting(
  remove: (tx: Prisma.TransactionClient) => Promise<unknown>,
  action: () => Promise<unknown>,
) {
  let attempt: Promise<unknown> = Promise.resolve()
  let settled = false
  await db.$transaction(async (tx) => {
    await remove(tx)
    attempt = action().finally(() => {
      settled = true
    })
    // Handled by the caller; this only stops an unhandled rejection meanwhile.
    attempt.catch(() => {})
    for (;;) {
      const [{ waiting }] = await db.$queryRaw<[{ waiting: bigint }]>`
        SELECT count(*) AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
      `
      if (waiting > 0 || settled) break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  })
  return attempt
}

async function nextTaskNumberOf(projectId: string) {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
  })
  return project.nextTaskNumber
}

describe('createTask', () => {
  it('assigns numbers 1, 2, 3 and advances nextTaskNumber', async () => {
    const project = await createWebsite()

    const first = await createTask(project.id, { title: 'One' })
    const second = await createTask(project.id, { title: 'Two' })
    const third = await createTask(project.id, { title: 'Three' })

    expect([first.number, second.number, third.number]).toEqual([1, 2, 3])
    await expect(nextTaskNumberOf(project.id)).resolves.toBe(4)
  })

  it('numbers each project on its own', async () => {
    const website = await createWebsite()
    const other = await createProject({ name: 'Other', key: 'OTH' })

    await createTask(website.id, { title: 'One' })
    await createTask(website.id, { title: 'Two' })
    const task = await createTask(other.id, { title: 'First' })

    expect(task.number).toBe(1)
  })

  it('gives ten concurrent creates in one project the numbers 1 to 10', async () => {
    const project = await createWebsite()

    const tasks = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createTask(project.id, { title: `Task ${i + 1}` }),
      ),
    )

    expect(tasks.map((task) => task.number).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
    expect(new Set(tasks.map((task) => task.order)).size).toBe(10)
    await expect(nextTaskNumberOf(project.id)).resolves.toBe(11)
  })

  it('puts the task at the end of the first status with the given fields', async () => {
    const project = await createWebsite()
    const backlog = project.statuses[0]
    await createTask(project.id, { title: 'Earlier' })

    const task = await createTask(project.id, {
      title: '  Write copy ',
      description: 'Hero and pricing.',
      priority: 'high',
      dueDate: '2026-10-15',
    })

    expect(task).toMatchObject({
      projectId: project.id,
      statusId: backlog.id,
      status: { name: 'Backlog', category: 'todo' },
      title: 'Write copy',
      description: 'Hero and pricing.',
      priority: 'high',
      dueDate: '2026-10-15',
      order: 2,
      completedAt: null,
      labels: [],
    })
  })

  it('uses the given status', async () => {
    const project = await createWebsite()
    const inProgress = project.statuses[2]

    const task = await createTask(project.id, {
      title: 'Write copy',
      statusId: inProgress.id,
    })

    expect(task).toMatchObject({
      statusId: inProgress.id,
      order: 1,
      completedAt: null,
    })
  })

  it('starts a task in a done status completed', async () => {
    const project = await createWebsite()
    const done = project.statuses[3]

    const task = await createTask(project.id, {
      title: 'Write copy',
      statusId: done.id,
    })

    expect(task.completedAt).toBeInstanceOf(Date)
  })

  it('adds to an archived project', async () => {
    const project = await createWebsite()
    await archiveProject(project.id)

    const task = await createTask(project.id, { title: 'Write copy' })

    expect(task.number).toBe(1)
  })

  it('writes one task.created activity row', async () => {
    const project = await createWebsite()
    let id = ''

    const rows = await newActivity(project.id, async () => {
      id = (await createTask(project.id, { title: 'Write copy' })).id
    })

    expect(rows).toEqual([
      {
        type: 'task.created',
        payload: { number: 1, title: 'Write copy' },
        taskId: id,
      },
    ])
  })

  it("throws NotFoundError for another project's status and writes nothing", async () => {
    const project = await createWebsite()
    const other = await createProject({ name: 'Other', key: 'OTH' })

    const attempt = createTask(project.id, {
      title: 'Write copy',
      statusId: other.statuses[0].id,
    })

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(db.task.count()).resolves.toBe(0)
    await expect(nextTaskNumberOf(project.id)).resolves.toBe(1)
  })

  it('throws NotFoundError for an unknown project', async () => {
    const attempt = createTask(UNKNOWN_ID, { title: 'Write copy' })

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws ConflictError when the project has no statuses', async () => {
    const project = await createWebsite()
    await db.status.deleteMany({ where: { projectId: project.id } })

    const attempt = createTask(project.id, { title: 'Write copy' })

    await expect(attempt).rejects.toBeInstanceOf(ConflictError)
    await expect(nextTaskNumberOf(project.id)).resolves.toBe(1)
  })

  it('attaches the given labels and returns them sorted by name', async () => {
    const project = await createWebsite()
    const design = await createLabel(project.id, 'design')
    const bug = await createLabel(project.id, 'bug')
    let id = ''

    const rows = await newActivity(project.id, async () => {
      const task = await createTask(project.id, {
        title: 'Write copy',
        labelIds: [design.id, bug.id],
      })
      id = task.id
      expect(task.labels).toEqual([bug, design])
    })

    expect(rows).toEqual([
      {
        type: 'task.created',
        payload: { number: 1, title: 'Write copy' },
        taskId: id,
      },
    ])
  })

  it.each([
    ['another project', true],
    ['no project', false],
  ])(
    'throws NotFoundError for a label of %s and writes nothing',
    async (_, inOther) => {
      const project = await createWebsite()
      const design = await createLabel(project.id, 'design')
      const other = await createProject({ name: 'Other', key: 'OTH' })
      const foreign = inOther
        ? (await createLabel(other.id, 'design')).id
        : UNKNOWN_ID

      const attempt = createTask(project.id, {
        title: 'Write copy',
        labelIds: [design.id, foreign],
      })

      await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
      await expect(attempt).rejects.toMatchObject({
        message: `No label with id ${foreign} in this project.`,
      })
      await expect(db.task.count()).resolves.toBe(0)
      await expect(nextTaskNumberOf(project.id)).resolves.toBe(1)
    },
  )

  it('throws NotFoundError when a label is deleted before the write', async () => {
    const project = await createWebsite()
    const design = await createLabel(project.id, 'design')

    const attempt = deleteLabelDuring(design.id, () =>
      createTask(project.id, { title: 'Write copy', labelIds: [design.id] }),
    )

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({
      message: `No label with id ${design.id} in this project.`,
    })
    await expect(db.task.count()).resolves.toBe(0)
  })

  it('rejects invalid input without writing anything', async () => {
    const project = await createWebsite()

    await expect(createTask(project.id, { title: ' ' })).rejects.toThrow()
    await expect(
      createTask(project.id, { title: 'Write copy', dueDate: '2026-13-01' }),
    ).rejects.toThrow()

    await expect(db.task.count()).resolves.toBe(0)
  })
})

describe('getTask', () => {
  it('returns the task with its status and labels', async () => {
    const project = await createWebsite()
    const created = await createTask(project.id, { title: 'Write copy' })
    const design = await createLabel(project.id, 'design')
    const bug = await createLabel(project.id, 'bug')
    await db.taskLabel.createMany({
      data: [
        { taskId: created.id, labelId: design.id },
        { taskId: created.id, labelId: bug.id },
      ],
    })

    const task = await getTask(created.id)

    expect(task).toMatchObject({
      id: created.id,
      title: 'Write copy',
      status: { name: 'Backlog' },
    })
    expect(task.labels).toEqual([bug, design])
  })

  it('throws NotFoundError for an unknown id', async () => {
    const attempt = getTask(UNKNOWN_ID)

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('listTasks', () => {
  async function createBoard() {
    const project = await createWebsite()
    const [backlog, todo] = project.statuses
    const design = await createLabel(project.id, 'design')
    const copy = await createTask(project.id, {
      title: 'Write copy',
      description: 'Hero and PRICING sections.',
      priority: 'high',
      dueDate: '2026-10-05',
    })
    const logo = await createTask(project.id, {
      title: 'Draw the logo',
      statusId: todo.id,
      priority: 'low',
      dueDate: '2026-10-10',
    })
    const deploy = await createTask(project.id, { title: 'Deploy' })
    await db.taskLabel.create({ data: { taskId: logo.id, labelId: design.id } })
    // Tasks of another project never show up.
    const other = await createProject({ name: 'Other', key: 'OTH' })
    await createTask(other.id, { title: 'Write copy', priority: 'high' })
    return { project, backlog, todo, design, copy, logo, deploy }
  }

  async function titles(projectId: string, input = {}) {
    return (await listTasks(projectId, input)).map((task) => task.title)
  }

  it('returns every task of the project in board order', async () => {
    const { project } = await createBoard()

    const tasks = await listTasks(project.id)

    expect(tasks.map((task) => task.title)).toEqual([
      'Write copy',
      'Deploy',
      'Draw the logo',
    ])
    expect(tasks[2].labels.map((label) => label.name)).toEqual(['design'])
  })

  it('filters by status', async () => {
    const { project, todo } = await createBoard()

    await expect(titles(project.id, { statusId: todo.id })).resolves.toEqual([
      'Draw the logo',
    ])
  })

  it('filters by priority', async () => {
    const { project } = await createBoard()

    await expect(titles(project.id, { priority: 'high' })).resolves.toEqual([
      'Write copy',
    ])
  })

  it('filters by label', async () => {
    const { project, design } = await createBoard()

    await expect(titles(project.id, { labelId: design.id })).resolves.toEqual([
      'Draw the logo',
    ])
  })

  it('filters by a due range that includes both ends', async () => {
    const { project } = await createBoard()

    await expect(
      titles(project.id, { dueFrom: '2026-10-05', dueTo: '2026-10-10' }),
    ).resolves.toEqual(['Write copy', 'Draw the logo'])
    await expect(
      titles(project.id, { dueFrom: '2026-10-06' }),
    ).resolves.toEqual(['Draw the logo'])
    await expect(titles(project.id, { dueTo: '2026-10-09' })).resolves.toEqual([
      'Write copy',
    ])
    await expect(
      titles(project.id, { dueFrom: '2026-10-06', dueTo: '2026-10-09' }),
    ).resolves.toEqual([])
  })

  it('matches text in the title or description, ignoring case', async () => {
    const { project } = await createBoard()

    await expect(titles(project.id, { q: 'LOGO' })).resolves.toEqual([
      'Draw the logo',
    ])
    await expect(titles(project.id, { q: 'pricing' })).resolves.toEqual([
      'Write copy',
    ])
    await expect(titles(project.id, { q: 'zebra' })).resolves.toEqual([])
  })

  it('applies every filter given', async () => {
    const { project, backlog } = await createBoard()

    await expect(
      titles(project.id, { statusId: backlog.id, q: 'e' }),
    ).resolves.toEqual(['Write copy', 'Deploy'])
    await expect(
      titles(project.id, { statusId: backlog.id, priority: 'high', q: 'e' }),
    ).resolves.toEqual(['Write copy'])
  })

  it('filters by completed', async () => {
    const { project, copy } = await createBoard()
    const done = project.statuses[3]
    await moveTask(copy.id, { statusId: done.id })

    await expect(titles(project.id, { completed: false })).resolves.toEqual([
      'Deploy',
      'Draw the logo',
    ])
    await expect(titles(project.id, { completed: true })).resolves.toEqual([
      'Write copy',
    ])
    await expect(
      titles(project.id, { completed: false, dueTo: '2026-10-09' }),
    ).resolves.toEqual([])
    await expect(
      titles(project.id, { completed: false, dueTo: '2026-10-10' }),
    ).resolves.toEqual(['Draw the logo'])
  })

  it('throws NotFoundError for an unknown project', async () => {
    await expect(listTasks(UNKNOWN_ID)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('updateTask', () => {
  it('changes the given fields and leaves the rest alone', async () => {
    const project = await createWebsite()
    const created = await createTask(project.id, {
      title: 'Write copy',
      description: 'Hero.',
      priority: 'low',
      dueDate: '2026-10-05',
    })

    const task = await updateTask(created.id, {
      title: ' Write the copy ',
      dueDate: '2026-10-07',
    })

    expect(task).toMatchObject({
      title: 'Write the copy',
      description: 'Hero.',
      priority: 'low',
      dueDate: '2026-10-07',
    })
  })

  it('clears the description and due date with null', async () => {
    const project = await createWebsite()
    const created = await createTask(project.id, {
      title: 'Write copy',
      description: 'Hero.',
      dueDate: '2026-10-05',
    })

    const task = await updateTask(created.id, {
      description: null,
      dueDate: null,
    })

    expect(task).toMatchObject({ description: null, dueDate: null })
  })

  it('writes one task.updated row naming the changed fields', async () => {
    const project = await createWebsite()
    const task = await createTask(project.id, {
      title: 'Write copy',
      priority: 'low',
    })

    const rows = await newActivity(project.id, () =>
      updateTask(task.id, {
        title: 'Write copy',
        priority: 'urgent',
        dueDate: '2026-10-05',
      }),
    )

    expect(rows).toEqual([
      {
        type: 'task.updated',
        payload: { number: 1, fields: ['priority', 'dueDate'] },
        taskId: task.id,
      },
    ])
  })

  it('writes nothing for a patch that changes nothing', async () => {
    const project = await createWebsite()
    const task = await createTask(project.id, {
      title: 'Write copy',
      dueDate: '2026-10-05',
    })

    const rows = await newActivity(project.id, async () => {
      await expect(updateTask(task.id, {})).resolves.toEqual(task)
      await expect(
        updateTask(task.id, { title: 'Write copy', dueDate: '2026-10-05' }),
      ).resolves.toEqual(task)
    })

    expect(rows).toEqual([])
  })

  it('replaces the label set and writes a task.updated row naming labels', async () => {
    const project = await createWebsite()
    const design = await createLabel(project.id, 'design')
    const bug = await createLabel(project.id, 'bug')
    const copy = await createLabel(project.id, 'copy')
    const task = await createTask(project.id, {
      title: 'Write copy',
      labelIds: [design.id, bug.id],
    })

    const rows = await newActivity(project.id, async () => {
      const updated = await updateTask(task.id, {
        labelIds: [copy.id, design.id],
      })
      expect(updated.labels).toEqual([copy, design])
    })

    expect(rows).toEqual([
      {
        type: 'task.updated',
        payload: { number: 1, fields: ['labels'] },
        taskId: task.id,
      },
    ])
    expect((await getTask(task.id)).labels).toEqual([copy, design])
  })

  it('names labels after the other changed fields', async () => {
    const project = await createWebsite()
    const design = await createLabel(project.id, 'design')
    const task = await createTask(project.id, { title: 'Write copy' })

    const rows = await newActivity(project.id, () =>
      updateTask(task.id, { title: 'Write the copy', labelIds: [design.id] }),
    )

    expect(rows).toEqual([
      expect.objectContaining({
        payload: { number: 1, fields: ['title', 'labels'] },
      }),
    ])
  })

  it('clears the labels with an empty list', async () => {
    const project = await createWebsite()
    const design = await createLabel(project.id, 'design')
    const task = await createTask(project.id, {
      title: 'Write copy',
      labelIds: [design.id],
    })

    const updated = await updateTask(task.id, { labelIds: [] })

    expect(updated.labels).toEqual([])
    await expect(db.taskLabel.count()).resolves.toBe(0)
    await expect(db.label.count()).resolves.toBe(1)
  })

  it('writes nothing for the same labels in another order', async () => {
    const project = await createWebsite()
    const design = await createLabel(project.id, 'design')
    const bug = await createLabel(project.id, 'bug')
    const task = await createTask(project.id, {
      title: 'Write copy',
      labelIds: [design.id, bug.id],
    })

    const rows = await newActivity(project.id, async () => {
      await expect(
        updateTask(task.id, { labelIds: [bug.id, design.id] }),
      ).resolves.toEqual(task)
    })

    expect(rows).toEqual([])
  })

  it("throws NotFoundError for another project's label and leaves the labels alone", async () => {
    const project = await createWebsite()
    const design = await createLabel(project.id, 'design')
    const other = await createProject({ name: 'Other', key: 'OTH' })
    const foreign = await createLabel(other.id, 'bug')
    const task = await createTask(project.id, {
      title: 'Write copy',
      labelIds: [design.id],
    })

    const rows = await newActivity(project.id, async () => {
      const attempt = updateTask(task.id, {
        title: 'Write the copy',
        labelIds: [foreign.id],
      })
      await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
      await expect(attempt).rejects.toMatchObject({
        message: `No label with id ${foreign.id} in this project.`,
      })
    })

    expect(rows).toEqual([])
    await expect(getTask(task.id)).resolves.toEqual(task)
  })

  it('throws NotFoundError when a label is deleted before the write', async () => {
    const project = await createWebsite()
    const design = await createLabel(project.id, 'design')
    const task = await createTask(project.id, { title: 'Write copy' })

    const attempt = deleteLabelDuring(design.id, () =>
      updateTask(task.id, { labelIds: [design.id] }),
    )

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({
      message: `No label with id ${design.id} in this project.`,
    })
    await expect(getTask(task.id)).resolves.toEqual(task)
  })

  it('throws NotFoundError for an unknown id', async () => {
    const attempt = updateTask(UNKNOWN_ID, { title: 'Write copy' })

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws NotFoundError when the task is deleted before the write', async () => {
    const project = await createWebsite()
    const task = await createTask(project.id, { title: 'Write copy' })

    const attempt = deleteDuring(task.id, () =>
      updateTask(task.id, { title: 'Write the copy' }),
    )

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('moveTask', () => {
  /** A project with tasks A, B, C in Backlog and X, Y in Todo. */
  async function createBoard() {
    const project = await createWebsite()
    const [backlog, todo, inProgress, done] = project.statuses
    const tasks: Record<string, Awaited<ReturnType<typeof createTask>>> = {}
    for (const title of ['A', 'B', 'C']) {
      tasks[title] = await createTask(project.id, { title })
    }
    for (const title of ['X', 'Y']) {
      tasks[title] = await createTask(project.id, { title, statusId: todo.id })
    }
    return { project, backlog, todo, inProgress, done, tasks }
  }

  it('appends to the end of another status by default', async () => {
    const { backlog, todo, tasks } = await createBoard()

    const moved = await moveTask(tasks.A.id, { statusId: todo.id })

    expect(moved).toMatchObject({ statusId: todo.id, order: 3 })
    await expect(columnOf(todo.id)).resolves.toEqual(['X', 'Y', 'A'])
    await expect(columnOf(backlog.id)).resolves.toEqual(['B', 'C'])
  })

  it('places the task between two neighbours at the midpoint', async () => {
    const { todo, tasks } = await createBoard()

    const moved = await moveTask(tasks.A.id, { statusId: todo.id, index: 1 })

    expect(moved.order).toBe(1.5)
    await expect(columnOf(todo.id)).resolves.toEqual(['X', 'A', 'Y'])
  })

  it('places the task before the first one at index 0', async () => {
    const { todo, tasks } = await createBoard()

    const moved = await moveTask(tasks.A.id, { statusId: todo.id, index: 0 })

    expect(moved.order).toBe(0)
    await expect(columnOf(todo.id)).resolves.toEqual(['A', 'X', 'Y'])
  })

  it('gives order 1 in an empty status', async () => {
    const { inProgress, tasks } = await createBoard()

    const moved = await moveTask(tasks.A.id, {
      statusId: inProgress.id,
      index: 3,
    })

    expect(moved).toMatchObject({ statusId: inProgress.id, order: 1 })
  })

  it('reorders within one status, counting the other tasks only', async () => {
    const { backlog, tasks } = await createBoard()

    await moveTask(tasks.A.id, { index: 1 })
    await expect(columnOf(backlog.id)).resolves.toEqual(['B', 'A', 'C'])

    await moveTask(tasks.C.id, { statusId: backlog.id, index: 0 })
    await expect(columnOf(backlog.id)).resolves.toEqual(['C', 'B', 'A'])

    await moveTask(tasks.C.id, { index: 2 })
    await expect(columnOf(backlog.id)).resolves.toEqual(['B', 'A', 'C'])
  })

  it('writes nothing for a move that leaves the task in place', async () => {
    const { project, backlog, tasks } = await createBoard()

    const rows = await newActivity(project.id, async () => {
      await expect(moveTask(tasks.B.id, { index: 1 })).resolves.toEqual(tasks.B)
      await expect(
        moveTask(tasks.C.id, { statusId: backlog.id }),
      ).resolves.toEqual(tasks.C)
      // An index past the end means the end, where C already is.
      await expect(moveTask(tasks.C.id, { index: 10 })).resolves.toEqual(
        tasks.C,
      )
    })

    expect(rows).toEqual([])
  })

  it('keeps the first task in place when given its current status and no index', async () => {
    const { project, backlog, tasks } = await createBoard()

    const rows = await newActivity(project.id, async () => {
      await expect(
        moveTask(tasks.A.id, { statusId: backlog.id }),
      ).resolves.toEqual(tasks.A)
    })

    expect(rows).toEqual([])
    await expect(columnOf(backlog.id)).resolves.toEqual(['A', 'B', 'C'])
    await expect(
      db.task.findUniqueOrThrow({ where: { id: tasks.A.id } }),
    ).resolves.toMatchObject({ order: tasks.A.order, completedAt: null })
  })

  it('counts the place of tasks with equal orders by number', async () => {
    const { project, backlog, tasks } = await createBoard()
    const tied = await db.task.update({
      where: { id: tasks.B.id },
      data: { order: tasks.A.order },
    })

    // The list shows A, B, C, so B at index 1 stays where it is.
    const rows = await newActivity(project.id, async () => {
      const moved = await moveTask(tasks.B.id, { index: 1 })
      expect(moved.order).toBe(tied.order)
    })

    expect(rows).toEqual([])
    await expect(
      listTasks(project.id, { statusId: backlog.id }),
    ).resolves.toMatchObject([{ title: 'A' }, { title: 'B' }, { title: 'C' }])
  })

  it('spreads the column out when the gap is too small to split', async () => {
    const { backlog, tasks } = await createBoard()
    await db.task.update({
      where: { id: tasks.B.id },
      data: { order: tasks.A.order },
    })

    const moved = await moveTask(tasks.C.id, { index: 1 })

    expect(moved.order).toBe(1.5)
    await expect(columnOf(backlog.id)).resolves.toEqual(['A', 'C', 'B'])
  })

  it('sets completedAt on entering a done status and clears it on leaving', async () => {
    const { todo, done, tasks } = await createBoard()
    await moveTask(tasks.B.id, { statusId: done.id })

    const finished = await moveTask(tasks.A.id, { statusId: done.id })
    expect(finished.completedAt).toBeInstanceOf(Date)

    // A reorder inside Done keeps the original completion time.
    const again = await moveTask(tasks.A.id, { index: 0 })
    expect(again.order).toBeLessThan(finished.order)
    expect(again.completedAt).toEqual(finished.completedAt)

    const reopened = await moveTask(tasks.A.id, { statusId: todo.id })
    expect(reopened.completedAt).toBeNull()
  })

  it('keeps completedAt on a reorder in a status that is not done', async () => {
    const { backlog, done, tasks } = await createBoard()
    await db.status.delete({ where: { id: done.id } })
    const completed = await completeTask(tasks.C.id)
    expect(completed.statusId).toBe(backlog.id)

    const moved = await moveTask(tasks.C.id, { index: 0 })

    expect(moved.completedAt).toEqual(completed.completedAt)
    await expect(columnOf(backlog.id)).resolves.toEqual(['C', 'A', 'B'])
  })

  it('writes one task.moved row with the status names', async () => {
    const { project, todo, tasks } = await createBoard()

    const rows = await newActivity(project.id, () =>
      moveTask(tasks.A.id, { statusId: todo.id }),
    )

    expect(rows).toEqual([
      {
        type: 'task.moved',
        payload: { number: 1, from: 'Backlog', to: 'Todo' },
        taskId: tasks.A.id,
      },
    ])
  })

  it("throws NotFoundError for another project's status", async () => {
    const { backlog, tasks } = await createBoard()
    const other = await createProject({ name: 'Other', key: 'OTH' })

    const attempt = moveTask(tasks.A.id, { statusId: other.statuses[1].id })

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(columnOf(backlog.id)).resolves.toEqual(['A', 'B', 'C'])
  })

  it('throws NotFoundError for an unknown id', async () => {
    const attempt = moveTask(UNKNOWN_ID, { index: 0 })

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws NotFoundError when the task is deleted before the write', async () => {
    const { todo, tasks } = await createBoard()

    const attempt = deleteDuring(tasks.A.id, () =>
      moveTask(tasks.A.id, { statusId: todo.id }),
    )

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('completeTask', () => {
  it('sets completedAt and moves the task to the end of Done', async () => {
    const project = await createWebsite()
    const done = project.statuses[3]
    await createTask(project.id, { title: 'Shipped', statusId: done.id })
    const task = await createTask(project.id, { title: 'Write copy' })

    const completed = await completeTask(task.id)

    expect(completed).toMatchObject({
      statusId: done.id,
      status: { name: 'Done' },
      order: 2,
    })
    expect(completed.completedAt).toBeInstanceOf(Date)
    await expect(columnOf(done.id)).resolves.toEqual(['Shipped', 'Write copy'])
  })

  it('keeps a task that is already in a done status where it is', async () => {
    const project = await createWebsite()
    const done = project.statuses[3]
    const created = await createTask(project.id, {
      title: 'Write copy',
      statusId: done.id,
    })
    // The service never leaves a task in Done uncompleted, but a row written
    // outside it can be.
    const task = await db.task.update({
      where: { id: created.id },
      data: { completedAt: null },
    })

    const completed = await completeTask(task.id)

    expect(completed).toMatchObject({ statusId: done.id, order: task.order })
    expect(completed.completedAt).toBeInstanceOf(Date)
  })

  it('stays in place in a project with no done status', async () => {
    const project = await createWebsite()
    const done = project.statuses[3]
    await db.status.delete({ where: { id: done.id } })
    const task = await createTask(project.id, { title: 'Write copy' })

    const completed = await completeTask(task.id)

    expect(completed.statusId).toBe(task.statusId)
    expect(completed.completedAt).toBeInstanceOf(Date)
  })

  it('writes one task.completed row, and nothing the second time', async () => {
    const project = await createWebsite()
    const task = await createTask(project.id, { title: 'Write copy' })

    const rows = await newActivity(project.id, () => completeTask(task.id))
    expect(rows).toEqual([
      { type: 'task.completed', payload: { number: 1 }, taskId: task.id },
    ])

    const first = await getTask(task.id)
    const repeat = await newActivity(project.id, async () => {
      await expect(completeTask(task.id)).resolves.toEqual(first)
    })
    expect(repeat).toEqual([])
  })

  it('throws NotFoundError for an unknown id', async () => {
    const attempt = completeTask(UNKNOWN_ID)

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws NotFoundError when the task is deleted before the write', async () => {
    const project = await createWebsite()
    const task = await createTask(project.id, { title: 'Write copy' })

    const attempt = deleteDuring(task.id, () => completeTask(task.id))

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('deleteTask', () => {
  it('removes the task and returns it', async () => {
    const project = await createWebsite()
    const task = await createTask(project.id, { title: 'Write copy' })

    await expect(deleteTask(task.id)).resolves.toEqual(task)

    await expect(
      db.task.findUnique({ where: { id: task.id } }),
    ).resolves.toBeNull()
  })

  it('writes one task.deleted row that outlives the task', async () => {
    const project = await createWebsite()
    const task = await createTask(project.id, { title: 'Write copy' })

    const rows = await newActivity(project.id, () => deleteTask(task.id))

    expect(rows).toEqual([
      {
        type: 'task.deleted',
        payload: { number: 1, title: 'Write copy' },
        taskId: null,
      },
    ])
    // The task.created row stays in the history too.
    await expect(
      db.activity.count({ where: { projectId: project.id, taskId: null } }),
    ).resolves.toBe(3)
  })

  it('does not reuse the number of a deleted task', async () => {
    const project = await createWebsite()
    const task = await createTask(project.id, { title: 'Write copy' })
    await deleteTask(task.id)

    const next = await createTask(project.id, { title: 'Draw the logo' })

    expect(next.number).toBe(2)
  })

  it('throws NotFoundError for an unknown id', async () => {
    const attempt = deleteTask(UNKNOWN_ID)

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
  })
})
