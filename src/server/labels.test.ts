// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '#/server/db'
import { ConflictError, NotFoundError } from '#/server/errors'
import { createLabel, deleteLabel, listLabels } from '#/server/labels'
import { createProject } from '#/server/projects'
import { createTask, getTask } from '#/server/tasks'
import { resetDatabase } from '#/test/db'

const UNKNOWN_ID = 'no-such-id'
const BLUE = '#2563eb'
const GREEN = '#15803d'

beforeEach(() => resetDatabase(db))

function createWebsite() {
  return createProject({ name: 'Website', key: 'WEB' })
}

describe('listLabels', () => {
  it('returns the project labels sorted by name', async () => {
    const project = await createWebsite()
    await createLabel(project.id, { name: 'research', color: BLUE })
    await createLabel(project.id, { name: 'bug', color: GREEN })
    await createLabel(project.id, { name: 'design', color: BLUE })
    const other = await createProject({ name: 'Other', key: 'OTH' })
    await createLabel(other.id, { name: 'admin', color: BLUE })

    const labels = await listLabels(project.id)

    expect(labels.map((label) => label.name)).toEqual([
      'bug',
      'design',
      'research',
    ])
  })

  it('returns an empty list for a project without labels', async () => {
    const project = await createWebsite()

    await expect(listLabels(project.id)).resolves.toEqual([])
  })

  it('throws NotFoundError for an unknown project', async () => {
    const attempt = listLabels(UNKNOWN_ID)

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('createLabel', () => {
  it('stores the trimmed name and the lower-case colour', async () => {
    const project = await createWebsite()

    const label = await createLabel(project.id, {
      name: '  design ',
      color: '#2563EB',
    })

    expect(label).toMatchObject({
      projectId: project.id,
      name: 'design',
      color: BLUE,
    })
    await expect(db.label.count()).resolves.toBe(1)
  })

  it('throws ConflictError for a name the project already has', async () => {
    const project = await createWebsite()
    await createLabel(project.id, { name: 'design', color: BLUE })

    const attempt = createLabel(project.id, { name: ' design', color: GREEN })

    await expect(attempt).rejects.toBeInstanceOf(ConflictError)
    await expect(attempt).rejects.toMatchObject({
      code: 'conflict',
      message: 'A label named design already exists in this project.',
    })
    await expect(db.label.count()).resolves.toBe(1)
  })

  it('allows the same name in another project', async () => {
    const project = await createWebsite()
    const other = await createProject({ name: 'Other', key: 'OTH' })
    await createLabel(project.id, { name: 'design', color: BLUE })

    const label = await createLabel(other.id, { name: 'design', color: BLUE })

    expect(label.projectId).toBe(other.id)
  })

  it('throws NotFoundError for an unknown project', async () => {
    const attempt = createLabel(UNKNOWN_ID, { name: 'design', color: BLUE })

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({
      message: `No project with id ${UNKNOWN_ID}.`,
    })
  })

  it('rejects invalid input without writing anything', async () => {
    const project = await createWebsite()

    await expect(
      createLabel(project.id, { name: ' ', color: BLUE }),
    ).rejects.toThrow()
    await expect(
      createLabel(project.id, { name: 'design', color: '#1d4ed8' }),
    ).rejects.toThrow()

    await expect(db.label.count()).resolves.toBe(0)
  })
})

describe('deleteLabel', () => {
  it('removes the label from its tasks and leaves the tasks', async () => {
    const project = await createWebsite()
    const design = await createLabel(project.id, {
      name: 'design',
      color: BLUE,
    })
    const bug = await createLabel(project.id, { name: 'bug', color: GREEN })
    const task = await createTask(project.id, {
      title: 'Write copy',
      labelIds: [design.id, bug.id],
    })

    const deleted = await deleteLabel(design.id)

    expect(deleted).toMatchObject({ id: design.id, name: 'design' })
    await expect(db.label.count()).resolves.toBe(1)
    await expect(db.taskLabel.count()).resolves.toBe(1)
    const after = await getTask(task.id)
    expect(after.labels.map((label) => label.name)).toEqual(['bug'])
  })

  it('throws NotFoundError for an unknown id', async () => {
    const attempt = deleteLabel(UNKNOWN_ID)

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError)
    await expect(attempt).rejects.toMatchObject({
      message: `No label with id ${UNKNOWN_ID}.`,
    })
  })
})
