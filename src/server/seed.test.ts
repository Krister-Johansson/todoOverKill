// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { activityPayloadSchemas } from '#/schemas/activity'
import { db } from '#/server/db'
import { SEED_PROJECT_KEYS, seed } from '#/server/seed'

const NOW = new Date('2026-03-15T12:00:00Z')
const PROJECT_KEYS = [...SEED_PROJECT_KEYS, 'OTHER']

async function deleteProjects(keys: Array<string>) {
  // Tasks first: the task-to-status foreign key is RESTRICT.
  await db.task.deleteMany({ where: { project: { key: { in: keys } } } })
  await db.project.deleteMany({ where: { key: { in: keys } } })
}

async function counts() {
  const [project, status, task, subtask, label, taskLabel, comment, activity] =
    await Promise.all([
      db.project.count(),
      db.status.count(),
      db.task.count(),
      db.subtask.count(),
      db.label.count(),
      db.taskLabel.count(),
      db.comment.count(),
      db.activity.count(),
    ])
  return { project, status, task, subtask, label, taskLabel, comment, activity }
}

/** The seeded content without ids or timestamps set by the database. */
async function snapshot() {
  const projects = await db.project.findMany({
    where: { key: { in: [...SEED_PROJECT_KEYS] } },
    orderBy: { key: 'asc' },
    select: {
      key: true,
      name: true,
      nextTaskNumber: true,
      statuses: {
        orderBy: { order: 'asc' },
        select: {
          name: true,
          order: true,
          category: true,
          _count: { select: { tasks: true } },
        },
      },
      labels: { orderBy: { name: 'asc' }, select: { name: true, color: true } },
      tasks: {
        orderBy: { number: 'asc' },
        select: {
          number: true,
          title: true,
          description: true,
          status: { select: { name: true } },
          priority: true,
          dueDate: true,
          order: true,
          completedAt: true,
          labels: {
            orderBy: { label: { name: 'asc' } },
            select: { label: { select: { name: true } } },
          },
          subtasks: {
            orderBy: { order: 'asc' },
            select: { title: true, done: true },
          },
          comments: { orderBy: { createdAt: 'asc' }, select: { body: true } },
        },
      },
    },
  })
  const activity = await db.activity.groupBy({
    by: ['type'],
    where: { project: { key: { in: [...SEED_PROJECT_KEYS] } } },
    _count: true,
    orderBy: { type: 'asc' },
  })
  return { projects, activity }
}

describe('seed', () => {
  let other: { id: string; updatedAt: Date }

  beforeAll(async () => {
    await deleteProjects(PROJECT_KEYS)
    const project = await db.project.create({
      data: {
        key: 'OTHER',
        name: 'Not seeded',
        statuses: { create: { name: 'Todo', order: 1, category: 'todo' } },
      },
      select: { id: true, statuses: { select: { id: true } } },
    })
    await db.task.create({
      data: {
        projectId: project.id,
        statusId: project.statuses[0].id,
        number: 1,
        title: 'Keep me',
        order: 1,
      },
    })
    other = await db.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { id: true, updatedAt: true },
    })
  })

  afterAll(async () => {
    await deleteProjects(PROJECT_KEYS)
    await db.$disconnect()
  })

  let first: Awaited<ReturnType<typeof counts>>
  let firstSnapshot: Awaited<ReturnType<typeof snapshot>>

  it('creates the TOK and DEMO projects with about 30 tasks', async () => {
    await expect(seed(db, { now: NOW })).resolves.toEqual({
      TOK: { tasks: 20 },
      DEMO: { tasks: 10 },
    })

    const projects = await db.project.findMany({
      where: { key: { in: [...SEED_PROJECT_KEYS] } },
      select: {
        key: true,
        nextTaskNumber: true,
        _count: { select: { tasks: true, statuses: true } },
      },
      orderBy: { key: 'asc' },
    })
    expect(projects).toEqual([
      { key: 'DEMO', nextTaskNumber: 11, _count: { tasks: 10, statuses: 4 } },
      { key: 'TOK', nextTaskNumber: 21, _count: { tasks: 20, statuses: 4 } },
    ])

    first = await counts()
    firstSnapshot = await snapshot()
    // 30 seeded tasks plus the one in OTHER.
    expect(first.task).toBe(31)
    expect(first.comment).toBeGreaterThan(0)
    expect(first.subtask).toBeGreaterThan(0)
    expect(first.taskLabel).toBeGreaterThan(0)
    expect(firstSnapshot.activity.map((row) => row.type)).toEqual([
      'comment.added',
      'project.created',
      'subtask.added',
      'task.completed',
      'task.created',
      'task.moved',
    ])
    // Done tasks have a completion time, others do not.
    for (const project of firstSnapshot.projects) {
      for (const task of project.tasks) {
        expect(task.completedAt !== null).toBe(task.status.name === 'Done')
      }
    }
  })

  it('writes comment rows that name the comment and hold none of its text', async () => {
    const rows = await db.activity.findMany({
      where: {
        type: 'comment.added',
        project: { key: { in: [...SEED_PROJECT_KEYS] } },
      },
      select: { taskId: true, payload: true },
    })
    expect(rows.length).toBe(first.comment)
    for (const row of rows) {
      const payload = activityPayloadSchemas['comment.added'].parse(row.payload)
      expect(payload).not.toHaveProperty('body')
      expect(payload).not.toHaveProperty('excerpt')
      expect(payload.commentId).toEqual(expect.any(String))
      const comment = await db.comment.findUnique({
        where: { id: payload.commentId! },
        select: { taskId: true },
      })
      expect(comment).toEqual({ taskId: row.taskId })
    }
  })

  it('ends in the same state when run again', async () => {
    await seed(db, { now: NOW })

    expect(await counts()).toEqual(first)
    expect(await snapshot()).toEqual(firstSnapshot)
  })

  it('leaves other projects alone', async () => {
    const project = await db.project.findUniqueOrThrow({
      where: { id: other.id },
      select: {
        updatedAt: true,
        _count: { select: { statuses: true, tasks: true } },
      },
    })
    expect(project).toEqual({
      updatedAt: other.updatedAt,
      _count: { statuses: 1, tasks: 1 },
    })
  })

  it(
    'runs through pnpm db:seed against the test database',
    { timeout: 60_000 },
    async () => {
      // Start without the seeded projects, so the counts only match if the
      // command wrote to this database.
      await deleteProjects([...SEED_PROJECT_KEYS])

      // prisma.config.ts lets the shell value win over .env, and the inherited
      // NODE_ENV=test makes src/server/db.ts pick DATABASE_URL_TEST as well.
      execFileSync('pnpm', ['exec', 'prisma', 'db', 'seed'], {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
        stdio: 'pipe',
      })

      expect(await counts()).toEqual(first)
    },
  )
})
