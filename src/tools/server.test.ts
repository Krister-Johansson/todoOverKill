// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import * as z from 'zod'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '#/server/db'
import { createLabel } from '#/server/labels'
import {
  DEFAULT_STATUSES,
  archiveProject,
  createProject,
} from '#/server/projects'
import { completeTask, createTask } from '#/server/tasks'
import { toolDefinitions } from '#/tools/definitions'
import { ToolError } from '#/tools/errors'
import {
  getProjectTool,
  getTaskTool,
  listProjectsTool,
  listTasksTool,
  searchTool,
  serverTools,
} from '#/tools/server'
import { resetDatabase } from '#/test/db'

beforeEach(() => resetDatabase(db))

/**
 * Parses the result with the tool's output schema, as the chat engine does.
 * Equal after parsing means the schema neither rejects nor drops a field.
 */
function expectOutput(schema: z.ZodType, result: unknown) {
  expect(schema.parse(result)).toEqual(result)
}

/** Calls a tool with arguments as a model might send them, unchecked by TypeScript. */
function callUnchecked(
  tool: { execute?: (args: never) => unknown },
  args: unknown,
) {
  return tool.execute?.(args as never)
}

/** The error a tool call rejects with. Fails when it resolves. */
async function rejection(call: unknown) {
  try {
    await call
  } catch (error) {
    return error
  }
  throw new Error('Expected the tool to throw.')
}

describe('tool definitions', () => {
  it('converts every input and output schema to JSON Schema', () => {
    for (const definition of toolDefinitions) {
      expect(() => z.toJSONSchema(definition.inputSchema)).not.toThrow()
      expect(() => z.toJSONSchema(definition.outputSchema)).not.toThrow()
    }
  })

  it('serves every definition once, under its name', () => {
    const names = serverTools.map((tool) => tool.name)

    expect(names).toEqual(toolDefinitions.map((definition) => definition.name))
    expect(names).toEqual([
      'list_projects',
      'get_project',
      'list_tasks',
      'get_task',
      'search',
    ])
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('list_projects', () => {
  it('leaves archived projects out unless asked for', async () => {
    await createProject({ name: 'Website', key: 'SITE' })
    const old = await createProject({ name: 'Archive me', key: 'OLD' })
    await archiveProject(old.id)

    const open = await listProjectsTool.execute?.({})
    const all = await listProjectsTool.execute?.({ includeArchived: true })

    expect(open?.map((project) => project.name)).toEqual(['Website'])
    expect(all?.map((project) => project.name)).toEqual([
      'Archive me',
      'Website',
    ])
    expectOutput(listProjectsTool.outputSchema, open)
    expectOutput(listProjectsTool.outputSchema, all)
  })
})

describe('get_project', () => {
  it('returns the project with its statuses in board order', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })

    const result = await getProjectTool.execute?.({ projectId: project.id })

    expect(result?.statuses.map((status) => status.name)).toEqual(
      DEFAULT_STATUSES.map((status) => status.name),
    )
    expect(result?.createdAt).toBe(project.createdAt.toISOString())
    expectOutput(getProjectTool.outputSchema, result)
  })

  it('reports an unknown project as not found', async () => {
    const error = await rejection(
      getProjectTool.execute?.({ projectId: 'missing' }),
    )

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({
      code: 'not_found',
      message: 'No project with id missing.',
    })
  })
})

describe('list_tasks', () => {
  it('filters and keeps board order', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const [backlog, todo] = project.statuses
    await createTask(project.id, {
      title: 'Later',
      statusId: todo.id,
      priority: 'high',
    })
    await createTask(project.id, {
      title: 'First',
      statusId: backlog.id,
      priority: 'high',
    })
    await createTask(project.id, { title: 'Low', priority: 'low' })

    const result = await listTasksTool.execute?.({
      projectId: project.id,
      priority: 'high',
    })

    expect(result?.map((task) => task.title)).toEqual(['First', 'Later'])
    expectOutput(listTasksTool.outputSchema, result)
  })

  it('returns a due date as a calendar day that the output schema takes', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    await createTask(project.id, { title: 'Launch', dueDate: '2026-10-15' })

    const result = await listTasksTool.execute?.({ projectId: project.id })

    expect(result?.[0].dueDate).toBe('2026-10-15')
    expectOutput(listTasksTool.outputSchema, result)
  })

  it('treats blank text as no filter', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    await createTask(project.id, { title: 'One' })
    await createTask(project.id, { title: 'Two' })

    const result = await listTasksTool.execute?.({
      projectId: project.id,
      q: '  ',
    })

    expect(result).toHaveLength(2)
  })

  it('reports an unknown project as not found', async () => {
    const error = await rejection(
      listTasksTool.execute?.({ projectId: 'missing' }),
    )

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({
      code: 'not_found',
      message: 'No project with id missing.',
    })
  })

  it('reports a missing project id in readable words', async () => {
    const error = await rejection(callUnchecked(listTasksTool, {}))

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({ code: 'validation' })
    expect(error).not.toHaveProperty('issues')
    expect((error as ToolError).message).toContain('→ at projectId')
  })

  it('reports a bad priority in readable words', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })

    const error = await rejection(
      callUnchecked(listTasksTool, { projectId: project.id, priority: 'top' }),
    )

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({ code: 'validation' })
    const { message } = error as ToolError
    expect(message).toContain(
      'Priority must be none, low, medium, high, or urgent.',
    )
    expect(message).toContain('→ at priority')
  })
})

describe('get_task', () => {
  it('returns the task with its status, labels and due date', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const bug = await createLabel(project.id, {
      name: 'Bug',
      color: '#dc2626',
    })
    const task = await createTask(project.id, {
      title: 'Fix the header',
      dueDate: '2026-10-15',
      labelIds: [bug.id],
    })
    await completeTask(task.id)

    const result = await getTaskTool.execute?.({ taskId: task.id })

    expect(result).toMatchObject({
      title: 'Fix the header',
      dueDate: '2026-10-15',
      status: { name: 'Done' },
      labels: [{ id: bug.id, name: 'Bug' }],
    })
    expect(result?.completedAt).toEqual(expect.any(String))
    expectOutput(getTaskTool.outputSchema, result)
  })

  it('reports an unknown task as not found', async () => {
    const error = await rejection(getTaskTool.execute?.({ taskId: 'missing' }))

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({
      code: 'not_found',
      message: 'No task with id missing.',
    })
  })
})

describe('search', () => {
  it('finds a task by title and one by reference', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const first = await createTask(project.id, { title: 'Header' })
    await createTask(project.id, { title: 'Footer' })

    const byTitle = await searchTool.execute?.({ query: 'foot' })
    const byReference = await searchTool.execute?.({ query: 'site-1' })

    expect(byTitle?.tasks.map((task) => task.title)).toEqual(['Footer'])
    expect(byReference?.tasks.map((task) => task.id)).toEqual([first.id])
    expect(byReference?.tasks[0]).toMatchObject({
      project: { key: 'SITE' },
      status: { name: 'Backlog' },
    })
    expectOutput(searchTool.outputSchema, byTitle)
    expectOutput(searchTool.outputSchema, byReference)
  })

  it('applies the default limit when none is given', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    for (let n = 1; n <= 11; n++) {
      await createTask(project.id, { title: `Page ${n}` })
    }

    const result = await searchTool.execute?.({ query: 'page' })

    expect(result?.tasks).toHaveLength(10)
    expectOutput(searchTool.outputSchema, result)
  })

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(searchTool, { query: 'web', limt: 5 }),
    )

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({ code: 'validation' })
    expect(error).not.toHaveProperty('issues')
    expect((error as ToolError).message).toContain('limt')
  })

  it('reports a blank query in readable words', async () => {
    const error = await rejection(searchTool.execute?.({ query: '   ' }))

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({ code: 'validation' })
    const { message } = error as ToolError
    expect(message).toContain('Search text is required.')
    expect(message).toContain('→ at query')
  })
})
