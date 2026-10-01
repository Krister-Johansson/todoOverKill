// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it } from 'vitest'

import { Route as projectRoute } from '#/routes/api/v1/projects.$projectId'
import { Route as statusesRoute } from '#/routes/api/v1/projects.$projectId.statuses'
import { Route as projectsRoute } from '#/routes/api/v1/projects'
import { db } from '#/server/db'
import { archiveProject, createProject } from '#/server/projects'
import { resetDatabase } from '#/test/db'
import { callRoute } from '#/test/rest'

beforeEach(() => resetDatabase(db))

const MISSING_ID = 'no-such-project'

function issuePaths(json: { error: { issues: Array<{ path: unknown }> } }) {
  return json.error.issues.map((issue) => issue.path)
}

describe('GET /api/v1/projects', () => {
  it('lists unarchived projects sorted by name', async () => {
    await createProject({ name: 'Website', key: 'WEB' })
    await createProject({ name: 'App', key: 'APP' })
    const old = await createProject({ name: 'Old', key: 'OLD' })
    await archiveProject(old.id)

    const { status, json } = await callRoute(projectsRoute, 'GET', {
      url: '/api/v1/projects',
    })

    expect(status).toBe(200)
    expect(json.map((project: { key: string }) => project.key)).toEqual([
      'APP',
      'WEB',
    ])
  })

  it('adds archived projects with ?includeArchived=true', async () => {
    await createProject({ name: 'Website', key: 'WEB' })
    const old = await createProject({ name: 'Old', key: 'OLD' })
    await archiveProject(old.id)

    const { status, json } = await callRoute(projectsRoute, 'GET', {
      url: '/api/v1/projects?includeArchived=true',
    })

    expect(status).toBe(200)
    expect(json.map((project: { key: string }) => project.key)).toEqual([
      'OLD',
      'WEB',
    ])
  })

  it('leaves archived projects out with ?includeArchived=false', async () => {
    const old = await createProject({ name: 'Old', key: 'OLD' })
    await archiveProject(old.id)

    const { json } = await callRoute(projectsRoute, 'GET', {
      url: '/api/v1/projects?includeArchived=false',
    })

    expect(json).toEqual([])
  })

  it('returns 400 with issues for an invalid includeArchived', async () => {
    const { status, json } = await callRoute(projectsRoute, 'GET', {
      url: '/api/v1/projects?includeArchived=maybe',
    })

    expect(status).toBe(400)
    expect(json.error.code).toBe('validation')
    expect(issuePaths(json)).toEqual([['includeArchived']])
  })
})

describe('POST /api/v1/projects', () => {
  it('creates a project with the default statuses and returns 201', async () => {
    const { status, json } = await callRoute(projectsRoute, 'POST', {
      url: '/api/v1/projects',
      body: { name: '  Website ', key: 'web' },
    })

    expect(status).toBe(201)
    expect(json).toMatchObject({ name: 'Website', key: 'WEB' })
    expect(json.id).toEqual(expect.any(String))
    expect(json.statuses.map((s: { name: string }) => s.name)).toEqual([
      'Backlog',
      'Todo',
      'In progress',
      'Done',
    ])
  })

  it('returns 400 with issues for an empty name and a bad key', async () => {
    const { status, json } = await callRoute(projectsRoute, 'POST', {
      url: '/api/v1/projects',
      body: { name: '', key: 'x' },
    })

    expect(status).toBe(400)
    expect(json).toEqual({
      error: {
        code: 'validation',
        message: expect.any(String),
        issues: expect.any(Array),
      },
    })
    expect(issuePaths(json)).toEqual(
      expect.arrayContaining([['name'], ['key']]),
    )
    expect(await db.project.count()).toBe(0)
  })

  it('returns 400 invalid_json for a malformed body', async () => {
    const { status, json } = await callRoute(projectsRoute, 'POST', {
      url: '/api/v1/projects',
      body: '{"name": ',
    })

    expect(status).toBe(400)
    expect(json.error.code).toBe('invalid_json')
  })

  it('returns 409 conflict for a key another project uses', async () => {
    await createProject({ name: 'Website', key: 'WEB' })

    const { status, json } = await callRoute(projectsRoute, 'POST', {
      url: '/api/v1/projects',
      body: { name: 'Webshop', key: 'web' },
    })

    expect(status).toBe(409)
    expect(json).toEqual({
      error: {
        code: 'conflict',
        message: 'Another project already uses the key WEB.',
      },
    })
  })
})

describe('GET /api/v1/projects/:id', () => {
  it('returns the project with its statuses', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })

    const { status, json } = await callRoute(projectRoute, 'GET', {
      url: `/api/v1/projects/${project.id}`,
      params: { projectId: project.id },
    })

    expect(status).toBe(200)
    expect(json).toMatchObject({ id: project.id, name: 'Website' })
    expect(json.statuses).toHaveLength(4)
  })

  it('returns 404 not_found for an unknown id', async () => {
    const { status, json } = await callRoute(projectRoute, 'GET', {
      url: `/api/v1/projects/${MISSING_ID}`,
      params: { projectId: MISSING_ID },
    })

    expect(status).toBe(404)
    expect(json).toEqual({
      error: {
        code: 'not_found',
        message: `No project with id ${MISSING_ID}.`,
      },
    })
  })
})

describe('PATCH /api/v1/projects/:id', () => {
  it('changes the given fields, and null clears the description', async () => {
    const project = await createProject({
      name: 'Website',
      key: 'WEB',
      description: 'The marketing site',
    })

    const { status, json } = await callRoute(projectRoute, 'PATCH', {
      url: `/api/v1/projects/${project.id}`,
      params: { projectId: project.id },
      body: { name: 'Site', description: null },
    })

    expect(status).toBe(200)
    expect(json).toMatchObject({
      name: 'Site',
      key: 'WEB',
      description: null,
    })
  })

  it('returns 400 with issues for an invalid colour', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })

    const { status, json } = await callRoute(projectRoute, 'PATCH', {
      url: `/api/v1/projects/${project.id}`,
      params: { projectId: project.id },
      body: { color: 'blue' },
    })

    expect(status).toBe(400)
    expect(json.error.code).toBe('validation')
    expect(issuePaths(json)).toEqual([['color']])
  })

  it('returns 409 conflict for a key another project uses', async () => {
    await createProject({ name: 'App', key: 'APP' })
    const project = await createProject({ name: 'Website', key: 'WEB' })

    const { status, json } = await callRoute(projectRoute, 'PATCH', {
      url: `/api/v1/projects/${project.id}`,
      params: { projectId: project.id },
      body: { key: 'APP' },
    })

    expect(status).toBe(409)
    expect(json.error.code).toBe('conflict')
  })

  it('returns 404 not_found for an unknown id', async () => {
    const { status, json } = await callRoute(projectRoute, 'PATCH', {
      url: `/api/v1/projects/${MISSING_ID}`,
      params: { projectId: MISSING_ID },
      body: { name: 'Site' },
    })

    expect(status).toBe(404)
    expect(json.error.code).toBe('not_found')
  })
})

describe('DELETE /api/v1/projects/:id', () => {
  it('archives the project and returns it', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })

    const { status, json } = await callRoute(projectRoute, 'DELETE', {
      url: `/api/v1/projects/${project.id}`,
      params: { projectId: project.id },
    })

    expect(status).toBe(200)
    expect(json.id).toBe(project.id)
    expect(json.archivedAt).toEqual(expect.any(String))
    expect(await db.project.count()).toBe(1)
  })

  it('leaves an archived project archived', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })
    const archived = await archiveProject(project.id)

    const { status, json } = await callRoute(projectRoute, 'DELETE', {
      url: `/api/v1/projects/${project.id}`,
      params: { projectId: project.id },
    })

    expect(status).toBe(200)
    expect(json.archivedAt).toBe(archived.archivedAt?.toISOString())
  })

  it('returns 404 not_found for an unknown id', async () => {
    const { status, json } = await callRoute(projectRoute, 'DELETE', {
      url: `/api/v1/projects/${MISSING_ID}`,
      params: { projectId: MISSING_ID },
    })

    expect(status).toBe(404)
    expect(json.error.code).toBe('not_found')
  })
})

describe('GET /api/v1/projects/:id/statuses', () => {
  it('returns the statuses in board order', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })

    const { status, json } = await callRoute(statusesRoute, 'GET', {
      url: `/api/v1/projects/${project.id}/statuses`,
      params: { projectId: project.id },
    })

    expect(status).toBe(200)
    expect(
      json.map((s: { name: string; order: number }) => [s.name, s.order]),
    ).toEqual([
      ['Backlog', 1],
      ['Todo', 2],
      ['In progress', 3],
      ['Done', 4],
    ])
  })

  it('returns 404 not_found for an unknown project', async () => {
    const { status, json } = await callRoute(statusesRoute, 'GET', {
      url: `/api/v1/projects/${MISSING_ID}/statuses`,
      params: { projectId: MISSING_ID },
    })

    expect(status).toBe(404)
    expect(json.error.code).toBe('not_found')
  })
})
