import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

import { toCalendarDay } from '../../src/lib/dates.ts'
import { createTestPrismaClient } from '../../src/test/db.ts'

// The Vitest route tests call the handlers directly. This spec sends real
// requests, so it catches a route that is missing from the route tree or
// shadowed by its parent.
//
// Other specs run in parallel and render the sidebar's project list, so the
// whole flow is one test that archives its project at the end, and the key is
// one no other spec uses. Four hex digits always fit the key rule
// (a letter, then 1 to 9 letters or digits).
const run = randomUUID().slice(0, 4).toUpperCase()
const key = `R${run}`
const name = `REST ${run}`

const db = createTestPrismaClient()

test.afterAll(async () => {
  // Tasks first: the project's cascade can reach a status while a task still
  // points at it, which the RESTRICT key on Task.statusId refuses, and that
  // would leave the project behind when an assertion fails mid-flow.
  await db.task.deleteMany({ where: { project: { key } } })
  await db.project.deleteMany({ where: { key } })
  await db.$disconnect()
})

test('the projects, statuses and tasks routes answer through the router', async ({
  request,
}) => {
  const invalid = await request.post('/api/v1/projects', {
    data: { name: '', key },
  })
  expect(invalid.status()).toBe(400)
  const invalidBody = await invalid.json()
  expect(invalidBody.error.code).toBe('validation')
  expect(invalidBody.error.issues).toEqual([
    expect.objectContaining({ path: ['name'] }),
  ])

  const created = await request.post('/api/v1/projects', {
    data: { name, key: key.toLowerCase() },
  })
  expect(created.status()).toBe(201)
  const project = await created.json()
  expect(project).toMatchObject({ name, key, archivedAt: null })

  const fetched = await request.get(`/api/v1/projects/${project.id}`)
  expect(fetched.status()).toBe(200)
  expect(await fetched.json()).toMatchObject({
    id: project.id,
    name,
    key,
    statuses: [
      { name: 'Backlog' },
      { name: 'Todo' },
      { name: 'In progress' },
      { name: 'Done' },
    ],
  })

  const statuses = await request.get(`/api/v1/projects/${project.id}/statuses`)
  expect(statuses.status()).toBe(200)
  const statusList = await statuses.json()
  expect(statusList.map((status: { name: string }) => status.name)).toEqual([
    'Backlog',
    'Todo',
    'In progress',
    'Done',
  ])

  const patched = await request.patch(`/api/v1/projects/${project.id}`, {
    data: { name: `${name} renamed` },
  })
  expect(patched.status()).toBe(200)
  expect(await patched.json()).toMatchObject({ name: `${name} renamed` })

  const today = toCalendarDay(new Date())
  const createdTask = await request.post(
    `/api/v1/projects/${project.id}/tasks`,
    { data: { title: 'Write copy', priority: 'high', dueDate: today } },
  )
  expect(createdTask.status()).toBe(201)
  const task = await createdTask.json()
  expect(task).toMatchObject({ number: 1, priority: 'high', dueDate: today })

  const taskIds = async (query: string) => {
    const response = await request.get(
      `/api/v1/projects/${project.id}/tasks${query}`,
    )
    expect(response.status()).toBe(200)
    return (await response.json()).map((t: { id: string }) => t.id)
  }
  expect(await taskIds('?priority=high')).toEqual([task.id])
  expect(await taskIds('?due=today')).toEqual([task.id])
  expect(await taskIds('?due=overdue')).toEqual([])

  const fetchedTask = await request.get(`/api/v1/tasks/${task.id}`)
  expect(fetchedTask.status()).toBe(200)
  expect(await fetchedTask.json()).toMatchObject({
    id: task.id,
    status: { name: 'Backlog' },
  })

  // REST has no labels route until F32, so the label comes from Prisma. The
  // project's cascade removes it in afterAll.
  const label = await db.label.create({
    data: { projectId: project.id, name: 'design', color: '#2563eb' },
  })
  const labelledTask = await request.post(
    `/api/v1/projects/${project.id}/tasks`,
    { data: { title: 'Draw the logo', labelIds: [label.id] } },
  )
  expect(labelledTask.status()).toBe(201)
  const labelled = await labelledTask.json()
  expect(labelled.labels).toEqual([
    expect.objectContaining({ id: label.id, name: 'design' }),
  ])
  const fetchedLabelled = await request.get(`/api/v1/tasks/${labelled.id}`)
  expect((await fetchedLabelled.json()).labels).toEqual([
    expect.objectContaining({ id: label.id }),
  ])
  const unlabelled = await request.patch(`/api/v1/tasks/${labelled.id}`, {
    data: { labelIds: [] },
  })
  expect(unlabelled.status()).toBe(200)
  expect((await unlabelled.json()).labels).toEqual([])

  const done = statusList.find((s: { name: string }) => s.name === 'Done')
  const movedTask = await request.patch(`/api/v1/tasks/${task.id}`, {
    data: { title: 'Write the copy', statusId: done.id },
  })
  expect(movedTask.status()).toBe(200)
  expect(await movedTask.json()).toMatchObject({
    title: 'Write the copy',
    status: { name: 'Done' },
    completedAt: expect.any(String),
  })

  const deletedTask = await request.delete(`/api/v1/tasks/${task.id}`)
  expect(deletedTask.status()).toBe(200)
  const afterDelete = await request.get(`/api/v1/tasks/${task.id}`)
  expect(afterDelete.status()).toBe(404)

  const listed = await request.get('/api/v1/projects')
  expect(listed.status()).toBe(200)
  const listedIds = (await listed.json()).map((p: { id: string }) => p.id)
  expect(listedIds).toContain(project.id)

  const archived = await request.delete(`/api/v1/projects/${project.id}`)
  expect(archived.status()).toBe(200)
  expect((await archived.json()).archivedAt).toEqual(expect.any(String))

  const afterArchive = await request.get('/api/v1/projects')
  const afterIds = (await afterArchive.json()).map((p: { id: string }) => p.id)
  expect(afterIds).not.toContain(project.id)

  const withArchived = await request.get(
    '/api/v1/projects?includeArchived=true',
  )
  const allIds = (await withArchived.json()).map((p: { id: string }) => p.id)
  expect(allIds).toContain(project.id)

  const missing = await request.get('/api/v1/projects/no-such-project')
  expect(missing.status()).toBe(404)
  expect((await missing.json()).error.code).toBe('not_found')
})
