// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '#/server/db'
import { ConflictError, NotFoundError } from '#/server/errors'
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  restoreProject,
  updateProject,
} from '#/server/projects'
import { resetDatabase } from '#/test/db'

const UNKNOWN_ID = 'no-such-project'

beforeEach(() => resetDatabase(db))

async function counts() {
  const [project, status, activity] = await Promise.all([
    db.project.count(),
    db.status.count(),
    db.activity.count(),
  ])
  return { project, status, activity }
}

function activityOf(projectId: string) {
  return db.activity.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    select: { type: true, payload: true, taskId: true },
  })
}

describe('createProject', () => {
  it('creates the project with the four default statuses in order', async () => {
    const project = await createProject({
      name: 'Website',
      key: 'WEB',
      description: 'The marketing site.',
      color: '#1d4ed8',
    })

    expect(project).toMatchObject({
      name: 'Website',
      key: 'WEB',
      description: 'The marketing site.',
      color: '#1d4ed8',
      nextTaskNumber: 1,
      archivedAt: null,
    })
    expect(
      project.statuses.map(({ name, order, category }) => ({
        name,
        order,
        category,
      })),
    ).toEqual([
      { name: 'Backlog', order: 1, category: 'todo' },
      { name: 'Todo', order: 2, category: 'todo' },
      { name: 'In progress', order: 3, category: 'in_progress' },
      { name: 'Done', order: 4, category: 'done' },
    ])
    await expect(
      db.status.count({ where: { projectId: project.id } }),
    ).resolves.toBe(4)
  })

  it('writes one project.created activity row', async () => {
    const project = await createProject({ name: 'Website', key: 'WEB' })

    await expect(activityOf(project.id)).resolves.toEqual([
      {
        type: 'project.created',
        payload: { name: 'Website', key: 'WEB' },
        taskId: null,
      },
    ])
  })

  it('parses its input, so a direct call stores a trimmed, upper-case key', async () => {
    const project = await createProject({ name: '  Website ', key: ' web ' })

    expect(project).toMatchObject({ name: 'Website', key: 'WEB' })
  })

  it('rejects invalid input without writing anything', async () => {
    await expect(createProject({ name: '', key: 'WEB' })).rejects.toThrow()
    await expect(createProject({ name: 'Web', key: 'w' })).rejects.toThrow()

    await expect(counts()).resolves.toEqual({
      project: 0,
      status: 0,
      activity: 0,
    })
  })

  it('throws ConflictError for a taken key and leaves no partial rows', async () => {
    await createProject({ name: 'Website', key: 'WEB' })
    const before = await counts()

    const attempt = createProject({ name: 'Other', key: 'web' })

    await expect(attempt).rejects.toBeInstanceOf(ConflictError)
    await expect(attempt).rejects.toMatchObject({
      code: 'conflict',
      message: 'Another project already uses the key WEB.',
    })
    await expect(counts()).resolves.toEqual(before)
  })
})

describe('listProjects', () => {
  beforeEach(async () => {
    await createProject({ name: 'Charlie', key: 'CHA' })
    const bravo = await createProject({ name: 'Bravo', key: 'BRA' })
    await createProject({ name: 'Alpha', key: 'ALP' })
    await archiveProject(bravo.id)
  })

  it('leaves archived projects out by default, sorted by name', async () => {
    const projects = await listProjects()

    expect(projects.map((p) => p.key)).toEqual(['ALP', 'CHA'])
  })

  it('leaves archived projects out when includeArchived is false', async () => {
    const projects = await listProjects({ includeArchived: false })

    expect(projects.map((p) => p.key)).toEqual(['ALP', 'CHA'])
  })

  it('includes archived projects when asked', async () => {
    const projects = await listProjects({ includeArchived: true })

    expect(projects.map((p) => p.key)).toEqual(['ALP', 'BRA', 'CHA'])
  })
})

describe('getProject', () => {
  it('returns the project with its statuses in order', async () => {
    const created = await createProject({ name: 'Website', key: 'WEB' })

    const project = await getProject(created.id)

    expect(project).toEqual(created)
    expect(project.statuses.map((s) => s.name)).toEqual([
      'Backlog',
      'Todo',
      'In progress',
      'Done',
    ])
  })

  it('throws NotFoundError for an unknown id', async () => {
    const attempt = getProject(UNKNOWN_ID)

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('updateProject', () => {
  it('changes the given fields and leaves the rest alone', async () => {
    const created = await createProject({
      name: 'Website',
      key: 'WEB',
      description: 'Old',
      color: '#1d4ed8',
    })

    const updated = await updateProject(created.id, {
      name: 'Web site',
      key: 'site',
    })

    expect(updated).toMatchObject({
      name: 'Web site',
      key: 'SITE',
      description: 'Old',
      color: '#1d4ed8',
    })
    expect(updated.statuses).toHaveLength(4)
  })

  it('clears the description and colour when given null', async () => {
    const created = await createProject({
      name: 'Website',
      key: 'WEB',
      description: 'Old',
      color: '#1d4ed8',
    })

    const updated = await updateProject(created.id, {
      description: null,
      color: null,
    })

    expect(updated).toMatchObject({
      name: 'Website',
      key: 'WEB',
      description: null,
      color: null,
    })
  })

  it('accepts an empty patch and changes nothing', async () => {
    const created = await createProject({ name: 'Website', key: 'WEB' })

    const updated = await updateProject(created.id, {})

    expect(updated).toMatchObject({
      name: created.name,
      key: created.key,
      description: created.description,
      color: created.color,
    })
  })

  it('throws ConflictError for a taken key and keeps the original', async () => {
    await createProject({ name: 'Website', key: 'WEB' })
    const app = await createProject({ name: 'App', key: 'APP' })

    const attempt = updateProject(app.id, { name: 'Renamed', key: 'web' })

    await expect(attempt).rejects.toBeInstanceOf(ConflictError)
    await expect(getProject(app.id)).resolves.toEqual(app)
  })

  it('throws NotFoundError for an unknown id', async () => {
    await expect(
      updateProject(UNKNOWN_ID, { name: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('archiveProject', () => {
  it('sets archivedAt and writes a project.archived activity row', async () => {
    const created = await createProject({ name: 'Website', key: 'WEB' })

    const archived = await archiveProject(created.id)

    expect(archived.archivedAt).toBeInstanceOf(Date)
    await expect(activityOf(created.id)).resolves.toEqual([
      expect.objectContaining({ type: 'project.created' }),
      {
        type: 'project.archived',
        payload: { name: 'Website', key: 'WEB' },
        taskId: null,
      },
    ])
  })

  it('changes nothing and writes no second row when already archived', async () => {
    const created = await createProject({ name: 'Website', key: 'WEB' })
    const first = await archiveProject(created.id)

    const second = await archiveProject(created.id)

    expect(second.archivedAt).toEqual(first.archivedAt)
    expect(second.updatedAt).toEqual(first.updatedAt)
    const types = (await activityOf(created.id)).map((row) => row.type)
    expect(types).toEqual(['project.created', 'project.archived'])
  })

  it('throws NotFoundError for an unknown id', async () => {
    await expect(archiveProject(UNKNOWN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(db.activity.count()).resolves.toBe(0)
  })
})

describe('restoreProject', () => {
  it('clears archivedAt so the project is listed again', async () => {
    const created = await createProject({ name: 'Website', key: 'WEB' })
    await archiveProject(created.id)

    const restored = await restoreProject(created.id)

    expect(restored.archivedAt).toBeNull()
    expect((await listProjects()).map((p) => p.key)).toEqual(['WEB'])
  })

  it('writes no activity row', async () => {
    const created = await createProject({ name: 'Website', key: 'WEB' })
    await archiveProject(created.id)

    await restoreProject(created.id)

    const types = (await activityOf(created.id)).map((row) => row.type)
    expect(types).toEqual(['project.created', 'project.archived'])
  })

  it('changes nothing for a project that is not archived', async () => {
    const created = await createProject({ name: 'Website', key: 'WEB' })

    const restored = await restoreProject(created.id)

    expect(restored).toEqual(created)
  })

  it('throws NotFoundError for an unknown id', async () => {
    await expect(restoreProject(UNKNOWN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})
