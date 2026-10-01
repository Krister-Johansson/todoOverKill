import { expect, test } from '@playwright/test'

import { createTestPrismaClient } from '../../src/test/db.ts'

// The Vitest route tests call the handlers directly. This spec sends real
// requests, so it catches a route that is missing from the route tree or
// shadowed by its parent.
//
// Other specs run in parallel and render the sidebar's project list, so the
// whole flow is one test that archives its project at the end, and the key is
// one no other spec uses.
const run = Math.random().toString(36).slice(2, 6).toUpperCase()
const key = `R${run}`
const name = `REST ${run}`

const db = createTestPrismaClient()

test.afterAll(async () => {
  await db.project.deleteMany({ where: { key } })
  await db.$disconnect()
})

test('the projects and statuses routes answer through the router', async ({
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
