// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it } from 'vitest'

import { toCalendarDay } from '#/lib/dates'
import { Route as projectTasksRoute } from '#/routes/api/v1/projects.$projectId.tasks'
import { Route as taskRoute } from '#/routes/api/v1/tasks.$taskId'
import { db } from '#/server/db'
import { createProject } from '#/server/projects'
import { createTask, moveTask } from '#/server/tasks'
import { resetDatabase } from '#/test/db'
import { callRoute } from '#/test/rest'

beforeEach(() => resetDatabase(db))

const MISSING_ID = 'no-such-id'

function issuePaths(json: { error: { issues: Array<{ path: unknown }> } }) {
  return json.error.issues.map((issue) => issue.path)
}

/** `days` from today's local calendar day, as `YYYY-MM-DD`. */
function dayFromToday(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return toCalendarDay(date)
}

/** Backlog, Todo, In progress, and Done, with three tasks and a label. */
async function createBoard() {
  const project = await createProject({ name: 'Website', key: 'WEB' })
  const [backlog, todo, , done] = project.statuses
  const design = await db.label.create({
    data: { projectId: project.id, name: 'design', color: '#1d4ed8' },
  })
  const copy = await createTask(project.id, {
    title: 'Write copy',
    description: 'Hero and PRICING sections.',
    priority: 'high',
  })
  const logo = await createTask(project.id, {
    title: 'Draw the logo',
    statusId: todo.id,
    priority: 'low',
  })
  const deploy = await createTask(project.id, { title: 'Deploy' })
  await db.taskLabel.create({ data: { taskId: logo.id, labelId: design.id } })
  // Tasks of another project never show up.
  const other = await createProject({ name: 'Other', key: 'OTH' })
  await createTask(other.id, { title: 'Write copy', priority: 'high' })
  return { project, other, backlog, todo, done, design, copy, logo, deploy }
}

function list(projectId: string, query = '') {
  return callRoute(projectTasksRoute, 'GET', {
    url: `/api/v1/projects/${projectId}/tasks${query}`,
    params: { projectId },
  })
}

function titles(json: Array<{ title: string }>) {
  return json.map((task) => task.title)
}

function patch(taskId: string, body: unknown) {
  return callRoute(taskRoute, 'PATCH', {
    url: `/api/v1/tasks/${taskId}`,
    params: { taskId },
    body,
  })
}

/** The project's activity types, sorted, so rows written in one millisecond compare alike. */
async function activityTypes(projectId: string) {
  const rows = await db.activity.findMany({ where: { projectId } })
  return rows.map((row) => row.type).sort()
}

describe('GET /api/v1/projects/:id/tasks', () => {
  it('lists the project tasks in board order', async () => {
    const { project } = await createBoard()

    const { status, json } = await list(project.id)

    expect(status).toBe(200)
    expect(titles(json)).toEqual(['Write copy', 'Deploy', 'Draw the logo'])
    expect(json[2].labels.map((l: { name: string }) => l.name)).toEqual([
      'design',
    ])
  })

  it('filters by status, priority, label and q', async () => {
    const { project, todo, design } = await createBoard()

    expect(titles((await list(project.id, `?status=${todo.id}`)).json)).toEqual(
      ['Draw the logo'],
    )
    expect(titles((await list(project.id, '?priority=high')).json)).toEqual([
      'Write copy',
    ])
    expect(
      titles((await list(project.id, `?label=${design.id}`)).json),
    ).toEqual(['Draw the logo'])
    expect(titles((await list(project.id, '?q=pricing')).json)).toEqual([
      'Write copy',
    ])
  })

  it('keeps the last value of a repeated parameter', async () => {
    const { project } = await createBoard()

    const { json } = await list(project.id, '?priority=low&priority=high')

    expect(titles(json)).toEqual(['Write copy'])
  })

  it('treats an empty value as absent for every filter', async () => {
    const { project } = await createBoard()

    const { status, json } = await list(
      project.id,
      '?status=&priority=&label=&due=&q=',
    )

    expect(status).toBe(200)
    expect(json).toHaveLength(3)
  })

  it.each(['statusId=x', 'completed=false', 'dueFrom=2026-10-01'])(
    'returns 400 for the unknown filter ?%s',
    async (query) => {
      const { project } = await createBoard()

      const { status, json } = await list(project.id, `?${query}`)

      expect(status).toBe(400)
      expect(json.error.code).toBe('validation')
      expect(json.error.issues).toEqual([
        expect.objectContaining({
          code: 'unrecognized_keys',
          keys: [query.split('=')[0]],
        }),
      ])
    },
  )

  it('filters by due today and due this week', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    for (const [title, days] of [
      ['Yesterday', -1],
      ['Today', 0],
      ['In six days', 6],
      ['In seven days', 7],
    ] as const) {
      await createTask(project.id, { title, dueDate: dayFromToday(days) })
    }
    await createTask(project.id, { title: 'No date' })

    expect(titles((await list(project.id, '?due=today')).json)).toEqual([
      'Today',
    ])
    expect(titles((await list(project.id, '?due=week')).json)).toEqual([
      'Today',
      'In six days',
    ])
  })

  it('leaves completed and not-yet-due tasks out of due=overdue', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const done = project.statuses[3]
    await createTask(project.id, {
      title: 'Late',
      dueDate: dayFromToday(-1),
    })
    await createTask(project.id, { title: 'Today', dueDate: dayFromToday(0) })
    const finished = await createTask(project.id, {
      title: 'Late but done',
      dueDate: dayFromToday(-1),
    })
    const moved = await moveTask(finished.id, { statusId: done.id })
    expect(moved.completedAt).not.toBeNull()

    const { status, json } = await list(project.id, '?due=overdue')

    expect(status).toBe(200)
    expect(titles(json)).toEqual(['Late'])
  })

  it('returns 400 with issues for a bad priority and a bad due', async () => {
    const { project } = await createBoard()

    const { status, json } = await list(project.id, '?priority=huge&due=soon')

    expect(status).toBe(400)
    expect(json.error.code).toBe('validation')
    expect(issuePaths(json)).toEqual(
      expect.arrayContaining([['priority'], ['due']]),
    )
  })

  it('returns 404 not_found for an unknown project', async () => {
    const { status, json } = await list(MISSING_ID)

    expect(status).toBe(404)
    expect(json.error.code).toBe('not_found')
  })
})

describe('POST /api/v1/projects/:id/tasks', () => {
  function create(projectId: string, body: unknown, contentType?: string) {
    return callRoute(projectTasksRoute, 'POST', {
      url: `/api/v1/projects/${projectId}/tasks`,
      params: { projectId },
      body,
      contentType,
    })
  }

  it('creates a task in the first status with number 1 and returns 201', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })

    const { status, json } = await create(project.id, {
      title: ' Write copy ',
      priority: 'high',
      dueDate: '2026-10-05',
    })

    expect(status).toBe(201)
    expect(json).toMatchObject({
      title: 'Write copy',
      number: 1,
      priority: 'high',
      dueDate: '2026-10-05',
      statusId: project.statuses[0].id,
      labels: [],
    })
  })

  it('creates the next number in the given status', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    await createTask(project.id, { title: 'First' })
    const todo = project.statuses[1]

    const { status, json } = await create(project.id, {
      title: 'Second',
      statusId: todo.id,
    })

    expect(status).toBe(201)
    expect(json).toMatchObject({ number: 2, statusId: todo.id })
  })

  it('returns 400 with issues for an empty title', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })

    const { status, json } = await create(project.id, { title: '' })

    expect(status).toBe(400)
    expect(issuePaths(json)).toEqual([['title']])
    expect(await db.task.count()).toBe(0)
  })

  it('returns 400 for an unknown field and creates nothing', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })

    const { status, json } = await create(project.id, {
      title: 'Write copy',
      status: project.statuses[1].id,
    })

    expect(status).toBe(400)
    expect(json.error.issues).toEqual([
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['status'] }),
    ])
    expect(await db.task.count()).toBe(0)
  })

  it('creates a task with labels and returns them sorted by name', async () => {
    const { project, design } = await createBoard()
    const bug = await db.label.create({
      data: { projectId: project.id, name: 'bug', color: '#dc2626' },
    })

    const { status, json } = await create(project.id, {
      title: 'Fix the footer',
      labelIds: [design.id, bug.id],
    })

    expect(status).toBe(201)
    expect(json.labels.map((l: { id: string }) => l.id)).toEqual([
      bug.id,
      design.id,
    ])
  })

  it('returns 404 for a label of another project and creates nothing', async () => {
    const { project, other } = await createBoard()
    const foreign = await db.label.create({
      data: { projectId: other.id, name: 'design', color: '#1d4ed8' },
    })
    const before = await db.task.count()

    const { status, json } = await create(project.id, {
      title: 'Fix the footer',
      labelIds: [foreign.id],
    })

    expect(status).toBe(404)
    expect(json.error.code).toBe('not_found')
    expect(await db.task.count()).toBe(before)
  })

  it('returns 404 for a status outside the project', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const other = await createProject({ name: 'Other', key: 'OTH' })

    const { status, json } = await create(project.id, {
      title: 'Write copy',
      statusId: other.statuses[0].id,
    })

    expect(status).toBe(404)
    expect(json.error.code).toBe('not_found')
    expect(await db.task.count()).toBe(0)
  })

  it('returns 404 for an unknown project', async () => {
    const { status, json } = await create(MISSING_ID, { title: 'Write copy' })

    expect(status).toBe(404)
    expect(json.error.code).toBe('not_found')
  })

  it('returns 415 for a text/plain body and creates nothing', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })

    const { status, json } = await create(
      project.id,
      { title: 'Write copy' },
      'text/plain',
    )

    expect(status).toBe(415)
    expect(json.error.code).toBe('unsupported_media_type')
    expect(await db.task.count()).toBe(0)
  })
})

describe('GET /api/v1/tasks/:id', () => {
  it('returns the task with its status and labels', async () => {
    const { logo, todo } = await createBoard()

    const { status, json } = await callRoute(taskRoute, 'GET', {
      url: `/api/v1/tasks/${logo.id}`,
      params: { taskId: logo.id },
    })

    expect(status).toBe(200)
    expect(json).toMatchObject({
      id: logo.id,
      title: 'Draw the logo',
      status: { id: todo.id, name: 'Todo' },
      labels: [{ name: 'design' }],
    })
  })

  it('returns 404 not_found for an unknown id', async () => {
    const { status, json } = await callRoute(taskRoute, 'GET', {
      url: `/api/v1/tasks/${MISSING_ID}`,
      params: { taskId: MISSING_ID },
    })

    expect(status).toBe(404)
    expect(json).toEqual({
      error: { code: 'not_found', message: `No task with id ${MISSING_ID}.` },
    })
  })
})

describe('PATCH /api/v1/tasks/:id', () => {
  it('changes the fields and writes no move', async () => {
    const { project, copy } = await createBoard()

    const { status, json } = await patch(copy.id, {
      title: 'Write the copy',
      description: null,
      priority: 'urgent',
      dueDate: '2026-11-01',
    })

    expect(status).toBe(200)
    expect(json).toMatchObject({
      title: 'Write the copy',
      description: null,
      priority: 'urgent',
      dueDate: '2026-11-01',
      statusId: copy.statusId,
    })
    expect(await activityTypes(project.id)).not.toContain('task.moved')
  })

  it('moves the task with only a statusId and returns the new status', async () => {
    const { project, copy, done } = await createBoard()

    const { status, json } = await patch(copy.id, { statusId: done.id })

    expect(status).toBe(200)
    expect(json).toMatchObject({
      title: 'Write copy',
      statusId: done.id,
      status: { name: 'Done' },
      completedAt: expect.any(String),
    })
    expect(await activityTypes(project.id)).not.toContain('task.updated')
  })

  it('places the task first with index 0', async () => {
    const { project, deploy } = await createBoard()

    const { status } = await patch(deploy.id, { index: 0 })

    expect(status).toBe(200)
    expect(titles((await list(project.id)).json)).toEqual([
      'Deploy',
      'Write copy',
      'Draw the logo',
    ])
  })

  it('changes fields and moves in one request', async () => {
    const { project, copy, todo } = await createBoard()
    const before = await activityTypes(project.id)

    const { status, json } = await patch(copy.id, {
      title: 'Write the copy',
      statusId: todo.id,
    })

    expect(status).toBe(200)
    expect(json).toMatchObject({
      title: 'Write the copy',
      statusId: todo.id,
      status: { name: 'Todo' },
    })
    expect(await activityTypes(project.id)).toEqual(
      [...before, 'task.moved', 'task.updated'].sort(),
    )
  })

  it('renames the task in place when the body repeats its current status', async () => {
    const { project, copy, backlog } = await createBoard()
    const before = await activityTypes(project.id)

    const { status, json } = await patch(copy.id, {
      title: 'Write the copy',
      statusId: backlog.id,
    })

    expect(status).toBe(200)
    expect(json).toMatchObject({
      title: 'Write the copy',
      statusId: backlog.id,
      order: copy.order,
    })
    expect(titles((await list(project.id)).json)).toEqual([
      'Write the copy',
      'Deploy',
      'Draw the logo',
    ])
    expect(await activityTypes(project.id)).toEqual(
      [...before, 'task.updated'].sort(),
    )
  })

  it('returns 404 for a status of another project and changes nothing', async () => {
    const { project, other, copy } = await createBoard()
    const before = await activityTypes(project.id)

    const { status, json } = await patch(copy.id, {
      title: 'Write the copy',
      statusId: other.statuses[1].id,
    })

    expect(status).toBe(404)
    expect(json.error.code).toBe('not_found')
    const task = await db.task.findUniqueOrThrow({ where: { id: copy.id } })
    expect(task).toMatchObject({ title: 'Write copy', statusId: copy.statusId })
    expect(await activityTypes(project.id)).toEqual(before)
  })

  it('replaces the whole label set with labelIds', async () => {
    const { project, logo } = await createBoard()
    const bug = await db.label.create({
      data: { projectId: project.id, name: 'bug', color: '#dc2626' },
    })

    const { status, json } = await patch(logo.id, { labelIds: [bug.id] })

    expect(status).toBe(200)
    expect(json.labels).toEqual([expect.objectContaining({ id: bug.id })])
    const fetched = await callRoute(taskRoute, 'GET', {
      url: `/api/v1/tasks/${logo.id}`,
      params: { taskId: logo.id },
    })
    expect(fetched.json.labels.map((l: { id: string }) => l.id)).toEqual([
      bug.id,
    ])
  })

  it('returns 404 for a label of another project and changes nothing', async () => {
    const { project, other, logo } = await createBoard()
    const foreign = await db.label.create({
      data: { projectId: other.id, name: 'design', color: '#1d4ed8' },
    })
    const before = await activityTypes(project.id)

    const { status, json } = await patch(logo.id, { labelIds: [foreign.id] })

    expect(status).toBe(404)
    expect(json.error.code).toBe('not_found')
    const task = await db.task.findUniqueOrThrow({
      where: { id: logo.id },
      include: { labels: { select: { label: { select: { name: true } } } } },
    })
    expect(task.labels).toEqual([{ label: { name: 'design' } }])
    expect(await activityTypes(project.id)).toEqual(before)
  })

  it('returns 400 for a repeated label id and writes nothing', async () => {
    const { project, copy, design } = await createBoard()
    const before = await activityTypes(project.id)

    const { status, json } = await patch(copy.id, {
      labelIds: [design.id, design.id],
    })

    expect(status).toBe(400)
    expect(issuePaths(json)).toEqual([['labelIds']])
    expect(await db.taskLabel.count({ where: { taskId: copy.id } })).toBe(0)
    expect(await activityTypes(project.id)).toEqual(before)
  })

  it('returns 400 for a negative index and writes nothing', async () => {
    const { project, copy } = await createBoard()
    const before = await activityTypes(project.id)

    const { status, json } = await patch(copy.id, {
      title: 'Write the copy',
      index: -1,
    })

    expect(status).toBe(400)
    expect(issuePaths(json)).toEqual([['index']])
    const task = await db.task.findUniqueOrThrow({ where: { id: copy.id } })
    expect(task.title).toBe('Write copy')
    expect(await activityTypes(project.id)).toEqual(before)
  })

  it.each([
    ['status', (doneId: string) => ({ status: doneId })],
    ['order', () => ({ order: 2 })],
    ['completed', () => ({ completed: true })],
  ] as const)(
    'returns 400 for the unknown field %s and changes nothing',
    async (key, makeBody) => {
      const { project, copy, done } = await createBoard()
      const before = await activityTypes(project.id)

      const { status, json } = await patch(copy.id, makeBody(done.id))

      expect(status).toBe(400)
      expect(json.error.code).toBe('validation')
      expect(json.error.issues).toEqual([
        expect.objectContaining({ code: 'unrecognized_keys', keys: [key] }),
      ])
      const task = await db.task.findUniqueOrThrow({ where: { id: copy.id } })
      expect(task).toMatchObject({ statusId: copy.statusId, completedAt: null })
      expect(await activityTypes(project.id)).toEqual(before)
    },
  )

  it('returns the task unchanged for an empty body', async () => {
    const { project, copy } = await createBoard()
    const before = await activityTypes(project.id)

    const { status, json } = await patch(copy.id, {})

    expect(status).toBe(200)
    expect(json).toMatchObject({ id: copy.id, title: 'Write copy' })
    expect(await activityTypes(project.id)).toEqual(before)
  })

  it.each([{}, { title: 'Ship' }, { index: 0 }])(
    'returns 404 not_found for an unknown task with %j',
    async (body) => {
      const { status, json } = await patch(MISSING_ID, body)

      expect(status).toBe(404)
      expect(json.error.code).toBe('not_found')
    },
  )
})

describe('DELETE /api/v1/tasks/:id', () => {
  function remove(taskId: string) {
    return callRoute(taskRoute, 'DELETE', {
      url: `/api/v1/tasks/${taskId}`,
      params: { taskId },
    })
  }

  it('deletes the task, returns it, and keeps the activity row', async () => {
    const { project, copy } = await createBoard()

    const { status, json } = await remove(copy.id)

    expect(status).toBe(200)
    expect(json).toMatchObject({ id: copy.id, title: 'Write copy' })
    expect(await db.task.findUnique({ where: { id: copy.id } })).toBeNull()
    const deleted = await db.activity.findFirst({
      where: { projectId: project.id, type: 'task.deleted' },
    })
    expect(deleted).toMatchObject({ taskId: null })

    const again = await remove(copy.id)
    expect(again.status).toBe(404)
    expect(again.json.error.code).toBe('not_found')
  })
})
