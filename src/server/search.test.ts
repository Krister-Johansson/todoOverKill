// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import * as z from 'zod'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '#/server/db'
import { archiveProject, createProject } from '#/server/projects'
import { search } from '#/server/search'
import { completeTask, createTask, updateTask } from '#/server/tasks'
import { resetDatabase } from '#/test/db'

beforeEach(() => resetDatabase(db))

function names(projects: Array<{ name: string }>) {
  return projects.map((project) => project.name)
}

function titles(tasks: Array<{ title: string }>) {
  return tasks.map((task) => task.title)
}

/** Sets updatedAt to a fixed minute, so the order does not hang on timing. */
async function touchTask(id: string, minute: number) {
  await db.task.update({
    where: { id },
    data: { updatedAt: new Date(Date.UTC(2026, 9, 2, 12, minute)) },
  })
}

async function touchProject(id: string, minute: number) {
  await db.project.update({
    where: { id },
    data: { updatedAt: new Date(Date.UTC(2026, 9, 2, 12, minute)) },
  })
}

describe('search', () => {
  it('finds a project by name and one by key', async () => {
    await createProject({ name: 'Website', key: 'SITE' })
    await createProject({ name: 'Mobile', key: 'WEB' })
    await createProject({ name: 'Backend', key: 'API' })

    const { projects } = await search('web')

    expect(names(projects).sort()).toEqual(['Mobile', 'Website'])
  })

  it('finds a task by title and one by description', async () => {
    const project = await createProject({ name: 'Mobile', key: 'MOB' })
    await createTask(project.id, { title: 'Fix the web view' })
    await createTask(project.id, {
      title: 'Login',
      description: 'Same as on the web.',
    })
    await createTask(project.id, { title: 'Push notifications' })

    const { tasks } = await search('web')

    expect(titles(tasks).sort()).toEqual(['Fix the web view', 'Login'])
  })

  it('finds a task by its exact reference in any case', async () => {
    const project = await createProject({ name: 'todoOverKill', key: 'TOK' })
    const first = await createTask(project.id, { title: 'First' })
    for (let n = 2; n <= 10; n++) {
      await createTask(project.id, { title: `Task ${n}` })
    }

    for (const query of ['tok-1', 'TOK-1', 'Tok-1']) {
      const { tasks } = await search(query)
      expect(tasks.map((task) => task.id)).toEqual([first.id])
    }
  })

  it('does not match a reference to another project or a partial one', async () => {
    const tok = await createProject({ name: 'todoOverKill', key: 'TOK' })
    const other = await createProject({ name: 'Other', key: 'OTH' })
    await createTask(tok.id, { title: 'First' })
    await createTask(other.id, { title: 'Other first' })

    expect((await search('OTH-2')).tasks).toEqual([])
    expect((await search('TOK')).tasks).toEqual([])
    expect((await search('OK-1')).tasks).toEqual([])
  })

  it('treats a reference number too big for the column as text', async () => {
    const project = await createProject({ name: 'todoOverKill', key: 'TOK' })
    await createTask(project.id, { title: 'See TOK-99999999999' })

    const { tasks } = await search('tok-99999999999')

    expect(titles(tasks)).toEqual(['See TOK-99999999999'])
  })

  it('returns a task that matches by reference and description once', async () => {
    const project = await createProject({ name: 'todoOverKill', key: 'TOK' })
    const task = await createTask(project.id, {
      title: 'Search',
      description: 'Follow-up to tok-1.',
    })

    const { tasks } = await search('tok-1')

    expect(tasks.map((found) => found.id)).toEqual([task.id])
  })

  it('returns a project that matches by name and key once', async () => {
    await createProject({ name: 'Web shop', key: 'WEB' })

    const { projects } = await search('web')

    expect(names(projects)).toEqual(['Web shop'])
  })

  it('ignores case in names, keys, titles and descriptions', async () => {
    const project = await createProject({ name: 'WEBSITE', key: 'SITE' })
    await createTask(project.id, { title: 'NEW WEB FONT' })
    await createTask(project.id, { title: 'Copy', description: 'wEb copy' })

    const { projects, tasks } = await search('Web')

    expect(names(projects)).toEqual(['WEBSITE'])
    expect(titles(tasks).sort()).toEqual(['Copy', 'NEW WEB FONT'])
    expect(names((await search('site')).projects)).toEqual(['WEBSITE'])
  })

  it.each([
    ['%', ['100% done']],
    ['_', ['a_b']],
    ['a_b', ['a_b']],
    ['\\', ['back\\slash']],
    ['back\\', ['back\\slash']],
  ])('takes %j literally', async (query, expected) => {
    const project = await createProject({ name: 'Plain', key: 'PLN' })
    for (const title of ['100% done', 'a_b', 'abc', 'ab', 'back\\slash']) {
      await createTask(project.id, { title })
    }

    const { tasks } = await search(query)

    expect(titles(tasks)).toEqual(expected)
  })

  it('leaves out archived projects and their tasks', async () => {
    const archived = await createProject({ name: 'Old web', key: 'OLDWEB' })
    await createTask(archived.id, { title: 'Web archive' })
    await archiveProject(archived.id)

    expect(await search('web')).toEqual({ projects: [], tasks: [] })
    expect(await search('oldweb-1')).toEqual({ projects: [], tasks: [] })
  })

  it('includes completed tasks', async () => {
    const project = await createProject({ name: 'Mobile', key: 'MOB' })
    const task = await createTask(project.id, { title: 'Web view' })
    await completeTask(task.id)

    const { tasks } = await search('web')

    expect(tasks).toEqual([
      expect.objectContaining({ id: task.id, status: { name: 'Done' } }),
    ])
  })

  it('returns the documented fields of each kind', async () => {
    const project = await createProject({
      name: 'Website',
      key: 'WEB',
      color: '#1d4ed8',
    })
    const task = await createTask(project.id, { title: 'Web fonts' })

    expect(await search('web')).toEqual({
      projects: [
        { id: project.id, name: 'Website', key: 'WEB', color: '#1d4ed8' },
      ],
      tasks: [
        {
          id: task.id,
          number: 1,
          title: 'Web fonts',
          project: { key: 'WEB', name: 'Website' },
          status: { name: 'Backlog' },
        },
      ],
    })
  })

  it('returns at most 10 of each kind by default', async () => {
    const project = await createProject({ name: 'Web 0', key: 'W0' })
    for (let n = 1; n <= 11; n++) {
      await createProject({ name: `Web ${n}`, key: `W${n}` })
      await createTask(project.id, { title: `Web task ${n}` })
    }

    const { projects, tasks } = await search('web')

    expect(projects).toHaveLength(10)
    expect(tasks).toHaveLength(10)
  })

  it('applies a given limit to each kind', async () => {
    const project = await createProject({ name: 'Web 0', key: 'W0' })
    for (let n = 1; n <= 3; n++) {
      await createProject({ name: `Web ${n}`, key: `W${n}` })
      await createTask(project.id, { title: `Web task ${n}` })
    }

    const { projects, tasks } = await search('web', { limit: 2 })

    expect(projects).toHaveLength(2)
    expect(tasks).toHaveLength(2)
  })

  it('puts tasks whose title starts with the query first, each group newest first', async () => {
    const project = await createProject({ name: 'Mobile', key: 'MOB' })
    const tasks = {
      'Web old': await createTask(project.id, { title: 'Web old' }),
      'Web new': await createTask(project.id, { title: 'Web new' }),
      'Old web view': await createTask(project.id, { title: 'Old web view' }),
      'New web view': await createTask(project.id, { title: 'New web view' }),
      'In description': await createTask(project.id, {
        title: 'In description',
        description: 'web',
      }),
    }
    await touchTask(tasks['Old web view'].id, 1)
    await touchTask(tasks['Web old'].id, 2)
    await touchTask(tasks['In description'].id, 3)
    await touchTask(tasks['Web new'].id, 4)
    await touchTask(tasks['New web view'].id, 5)

    expect(titles((await search('web')).tasks)).toEqual([
      'Web new',
      'Web old',
      'New web view',
      'In description',
      'Old web view',
    ])
  })

  it('fills the limit with starts-with matches before the rest', async () => {
    const project = await createProject({ name: 'Mobile', key: 'MOB' })
    const late = await createTask(project.id, { title: 'Old web view' })
    await createTask(project.id, { title: 'Web one' })
    await createTask(project.id, { title: 'Web two' })
    await updateTask(late.id, { title: 'New web view' })

    const { tasks } = await search('web', { limit: 2 })

    expect(titles(tasks).sort()).toEqual(['Web one', 'Web two'])
    expect(titles((await search('web', { limit: 3 })).tasks)[2]).toBe(
      'New web view',
    )
  })

  it('puts the referenced task with the starts-with group', async () => {
    const project = await createProject({ name: 'todoOverKill', key: 'TOK' })
    const referenced = await createTask(project.id, { title: 'Search' })
    const mention = await createTask(project.id, {
      title: 'Follow-up',
      description: 'After tok-1.',
    })
    await touchTask(referenced.id, 1)
    await touchTask(mention.id, 2)

    expect(titles((await search('tok-1')).tasks)).toEqual([
      'Search',
      'Follow-up',
    ])
  })

  it('puts projects whose name starts with the query first, each group newest first', async () => {
    const projects = {
      'Web old': await createProject({ name: 'Web old', key: 'WOLD' }),
      'Web new': await createProject({ name: 'Web new', key: 'WNEW' }),
      'Old web': await createProject({ name: 'Old web', key: 'OLD' }),
      'By key': await createProject({ name: 'By key', key: 'WEBKEY' }),
    }
    await touchProject(projects['Old web'].id, 1)
    await touchProject(projects['Web old'].id, 2)
    await touchProject(projects['By key'].id, 3)
    await touchProject(projects['Web new'].id, 4)

    expect(names((await search('web')).projects)).toEqual([
      'Web new',
      'Web old',
      'By key',
      'Old web',
    ])
  })

  it('puts a project whose key is the query in the first group', async () => {
    const projects = {
      'Web site': await createProject({ name: 'Web site', key: 'SITE' }),
      'Old web': await createProject({ name: 'Old web', key: 'OLD' }),
      'Our web': await createProject({ name: 'Our web', key: 'WEB' }),
    }
    await touchProject(projects['Our web'].id, 1)
    await touchProject(projects['Web site'].id, 2)
    await touchProject(projects['Old web'].id, 3)

    expect(names((await search('web')).projects)).toEqual([
      'Web site',
      'Our web',
      'Old web',
    ])
  })

  it.each([
    ['an empty query', '', undefined],
    ['a blank query', '   ', undefined],
    ['a 201 character query', 'x'.repeat(201), undefined],
    ['limit 0', 'web', 0],
    ['limit 51', 'web', 51],
  ])('throws a ZodError for %s', async (_, query, limit) => {
    await expect(search(query, { limit })).rejects.toBeInstanceOf(z.ZodError)
  })
})
