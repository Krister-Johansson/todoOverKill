// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import * as z from 'zod'
import { beforeEach, describe, expect, it } from 'vitest'

import { addComment, listComments } from '#/server/comments'
import { db } from '#/server/db'
import { createLabel } from '#/server/labels'
import {
  DEFAULT_STATUSES,
  archiveProject,
  createProject,
} from '#/server/projects'
import { addSubtask, listSubtasks } from '#/server/subtasks'
import { completeTask, createTask, getTask } from '#/server/tasks'
import { toolDefinitions } from '#/tools/definitions'
import { ToolError } from '#/tools/errors'
import {
  addCommentTool,
  addSubtaskTool,
  archiveProjectTool,
  completeTaskTool,
  createLabelTool,
  createProjectTool,
  createTaskTool,
  deleteCommentTool,
  deleteSubtaskTool,
  deleteTaskTool,
  getProjectTool,
  getTaskTool,
  listCommentsTool,
  listLabelsTool,
  listProjectsTool,
  listSubtasksTool,
  listTasksTool,
  moveSubtaskTool,
  moveTaskTool,
  readServerTools,
  searchTool,
  serverTools,
  updateCommentTool,
  updateSubtaskTool,
  updateTaskTool,
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
  // TanStack AI and the MCP SDK convert in input mode; output mode, the
  // default, throws on a transform.
  it.each(['input', 'output'] as const)(
    'converts every input and output schema to JSON Schema in %s mode',
    (io) => {
      for (const definition of toolDefinitions) {
        expect(() =>
          z.toJSONSchema(definition.inputSchema, { io }),
        ).not.toThrow()
        expect(() =>
          z.toJSONSchema(definition.outputSchema, { io }),
        ).not.toThrow()
      }
    },
  )

  it('returns an object from every tool, as MCP structured output needs', () => {
    for (const definition of toolDefinitions) {
      expect(
        z.toJSONSchema(definition.outputSchema, { io: 'input' }),
      ).toMatchObject({ type: 'object' })
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
      'create_project',
      'archive_project',
      'create_task',
      'update_task',
      'move_task',
      'complete_task',
      'delete_task',
      'list_subtasks',
      'add_subtask',
      'update_subtask',
      'move_subtask',
      'delete_subtask',
      'list_labels',
      'create_label',
      'list_comments',
      'add_comment',
      'update_comment',
      'delete_comment',
    ])
    expect(new Set(names).size).toBe(names.length)
  })

  it('asks for approval before archiving a project or deleting a task, subtask or comment only', () => {
    const needingApproval = [
      'archive_project',
      'delete_task',
      'delete_subtask',
      'delete_comment',
    ]

    expect(
      toolDefinitions
        .filter((definition) => definition.needsApproval)
        .map((definition) => definition.name),
    ).toEqual(needingApproval)
    expect(
      serverTools.filter((tool) => tool.needsApproval).map((tool) => tool.name),
    ).toEqual(needingApproval)
  })

  it('lists the tools that only read, for the read-only MCP server', () => {
    expect(readServerTools.map((tool) => tool.name)).toEqual([
      'list_projects',
      'get_project',
      'list_tasks',
      'get_task',
      'search',
      'list_subtasks',
      'list_labels',
      'list_comments',
    ])
  })
})

describe('list_projects', () => {
  it('leaves archived projects out unless asked for', async () => {
    await createProject({ name: 'Website', key: 'SITE' })
    const old = await createProject({ name: 'Archive me', key: 'OLD' })
    await archiveProject(old.id)

    const open = await listProjectsTool.execute?.({})
    const all = await listProjectsTool.execute?.({ includeArchived: true })

    expect(open?.projects.map((project) => project.name)).toEqual(['Website'])
    expect(all?.projects.map((project) => project.name)).toEqual([
      'Archive me',
      'Website',
    ])
    expectOutput(listProjectsTool.outputSchema, open)
    expectOutput(listProjectsTool.outputSchema, all)
  })

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(listProjectsTool, { archived: true }),
    )

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({ code: 'validation' })
    expect((error as ToolError).message).toContain('archived')
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

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(getProjectTool, { projectId: 'p1', id: 'p1' }),
    )

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({ code: 'validation' })
    expect((error as ToolError).message).toContain('"id"')
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

    expect(result?.tasks.map((task) => task.title)).toEqual(['First', 'Later'])
    expectOutput(listTasksTool.outputSchema, result)
  })

  it('returns a due date as a calendar day that the output schema takes', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    await createTask(project.id, { title: 'Launch', dueDate: '2026-10-15' })

    const result = await listTasksTool.execute?.({ projectId: project.id })

    expect(result?.tasks[0].dueDate).toBe('2026-10-15')
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

    expect(result?.tasks).toHaveLength(2)
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

  it('reports a REST-style filter name rather than dropping it', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    await createTask(project.id, { title: 'One' })

    const error = await rejection(
      callUnchecked(listTasksTool, {
        projectId: project.id,
        status: project.statuses[1].id,
      }),
    )

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({ code: 'validation' })
    expect((error as ToolError).message).toContain('status')
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

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(getTaskTool, { taskId: 't1', reference: 'SITE-1' }),
    )

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({ code: 'validation' })
    expect((error as ToolError).message).toContain('reference')
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

/** Asserts a validation ToolError whose message contains every given text. */
function expectValidation(error: unknown, ...texts: Array<string>) {
  expect(error).toBeInstanceOf(ToolError)
  expect(error).toMatchObject({ code: 'validation' })
  expect(error).not.toHaveProperty('issues')
  for (const text of texts) {
    expect((error as ToolError).message).toContain(text)
  }
}

/** Asserts a not_found ToolError with the given message. */
function expectNotFound(error: unknown, message: string) {
  expect(error).toBeInstanceOf(ToolError)
  expect(error).toMatchObject({ code: 'not_found', message })
}

describe('create_project', () => {
  it('returns the project with its statuses in board order', async () => {
    const result = await createProjectTool.execute?.({
      name: ' Website ',
      key: ' site ',
    })

    expect(result).toMatchObject({ name: 'Website', key: 'SITE' })
    expect(result?.statuses.map((status) => status.name)).toEqual(
      DEFAULT_STATUSES.map((status) => status.name),
    )
    expectOutput(createProjectTool.outputSchema, result)
  })

  // Creating has no id to miss, so a taken key stands in for not found.
  it('reports a taken key as a conflict', async () => {
    await createProject({ name: 'Website', key: 'SITE' })

    const error = await rejection(
      createProjectTool.execute?.({ name: 'Other', key: 'site' }),
    )

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({ code: 'conflict' })
    expect((error as ToolError).message).toContain('SITE')
  })

  it('reports an unknown field in readable words', async () => {
    const error = await rejection(
      callUnchecked(createProjectTool, {
        name: 'Website',
        key: 'SITE',
        colour: '#1d4ed8',
      }),
    )

    expectValidation(error, 'colour')
  })
})

describe('archive_project', () => {
  it('sets archivedAt and leaves it unchanged the second time', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })

    const first = await archiveProjectTool.execute?.({ projectId: project.id })
    const second = await archiveProjectTool.execute?.({
      projectId: project.id,
    })

    expect(first?.archivedAt).toEqual(expect.any(String))
    expect(second?.archivedAt).toBe(first?.archivedAt)
    expectOutput(archiveProjectTool.outputSchema, first)
  })

  it('reports an unknown project as not found', async () => {
    const error = await rejection(
      archiveProjectTool.execute?.({ projectId: 'missing' }),
    )

    expectNotFound(error, 'No project with id missing.')
  })

  it('reports a missing project id in readable words', async () => {
    const error = await rejection(callUnchecked(archiveProjectTool, {}))

    expectValidation(error, '→ at projectId')
  })
})

describe('create_task', () => {
  it("puts the task in the project's first status with its labels", async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const bug = await createLabel(project.id, {
      name: 'Bug',
      color: '#dc2626',
    })

    const result = await createTaskTool.execute?.({
      projectId: project.id,
      title: 'Fix the header',
      dueDate: '2026-10-15',
      labelIds: [bug.id],
    })

    expect(result).toMatchObject({
      title: 'Fix the header',
      number: 1,
      priority: 'none',
      dueDate: '2026-10-15',
      status: { name: 'Backlog' },
      labels: [{ id: bug.id, name: 'Bug' }],
    })
    expectOutput(createTaskTool.outputSchema, result)
  })

  it('reports a label of another project as not found', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const other = await createProject({ name: 'Other', key: 'OTHER' })
    const label = await createLabel(other.id, {
      name: 'Bug',
      color: '#dc2626',
    })

    const error = await rejection(
      createTaskTool.execute?.({
        projectId: project.id,
        title: 'Fix the header',
        labelIds: [label.id],
      }),
    )

    expectNotFound(error, `No label with id ${label.id} in this project.`)
  })

  it('reports an unknown project as not found', async () => {
    const error = await rejection(
      createTaskTool.execute?.({ projectId: 'missing', title: 'Ship' }),
    )

    expectNotFound(error, 'No project with id missing.')
  })

  it('reports a bad priority in readable words', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })

    const error = await rejection(
      callUnchecked(createTaskTool, {
        projectId: project.id,
        title: 'Ship',
        priority: 'top',
      }),
    )

    expectValidation(
      error,
      'Priority must be none, low, medium, high, or urgent.',
      '→ at priority',
    )
  })
})

describe('update_task', () => {
  it('replaces the labels and clears the due date', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const bug = await createLabel(project.id, {
      name: 'Bug',
      color: '#dc2626',
    })
    const ux = await createLabel(project.id, { name: 'UX', color: '#2563eb' })
    const task = await createTask(project.id, {
      title: 'Fix the header',
      dueDate: '2026-10-15',
      labelIds: [bug.id],
    })

    const replaced = await updateTaskTool.execute?.({
      taskId: task.id,
      labelIds: [ux.id],
      dueDate: null,
    })
    const cleared = await updateTaskTool.execute?.({
      taskId: task.id,
      labelIds: [],
    })

    expect(replaced?.labels.map((label) => label.name)).toEqual(['UX'])
    expect(replaced?.dueDate).toBeNull()
    expect(cleared?.labels).toEqual([])
    expect(cleared?.title).toBe('Fix the header')
    expectOutput(updateTaskTool.outputSchema, replaced)
  })

  it('reports an unknown task as not found', async () => {
    const error = await rejection(
      updateTaskTool.execute?.({ taskId: 'missing', title: 'Ship' }),
    )

    expectNotFound(error, 'No task with id missing.')
  })

  it('reports a move field rather than dropping it', async () => {
    const error = await rejection(
      callUnchecked(updateTaskTool, { taskId: 't1', statusId: 's1' }),
    )

    expectValidation(error, 'statusId')
  })
})

describe('move_task', () => {
  it('moves the task into Done and sets completedAt', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const done = project.statuses[3]
    const task = await createTask(project.id, { title: 'Ship' })

    const result = await moveTaskTool.execute?.({
      taskId: task.id,
      statusId: done.id,
    })

    expect(result?.status.name).toBe('Done')
    expect(result?.completedAt).toEqual(expect.any(String))
    expectOutput(moveTaskTool.outputSchema, result)
  })

  it('puts the task first at index 0', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    await createTask(project.id, { title: 'First' })
    const last = await createTask(project.id, { title: 'Last' })

    await moveTaskTool.execute?.({ taskId: last.id, index: 0 })
    const list = await listTasksTool.execute?.({ projectId: project.id })

    expect(list?.tasks.map((task) => task.title)).toEqual(['Last', 'First'])
  })

  it('reports a status of another project as not found', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const other = await createProject({ name: 'Other', key: 'OTHER' })
    const task = await createTask(project.id, { title: 'Ship' })
    const status = other.statuses[0]

    const error = await rejection(
      moveTaskTool.execute?.({ taskId: task.id, statusId: status.id }),
    )

    expectNotFound(error, `No status with id ${status.id} in this project.`)
  })

  it('reports an unknown task as not found', async () => {
    const error = await rejection(
      moveTaskTool.execute?.({ taskId: 'missing', index: 0 }),
    )

    expectNotFound(error, 'No task with id missing.')
  })

  it('reports a move with neither a status nor an index', async () => {
    const error = await rejection(moveTaskTool.execute?.({ taskId: 't1' }))

    expectValidation(error, 'Give a status, an index, or both.')
  })
})

describe('complete_task', () => {
  it('moves the task to Done and sets completedAt', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const task = await createTask(project.id, { title: 'Ship' })

    const result = await completeTaskTool.execute?.({ taskId: task.id })

    expect(result?.status.name).toBe('Done')
    expect(result?.completedAt).toEqual(expect.any(String))
    expectOutput(completeTaskTool.outputSchema, result)
  })

  it('reports an unknown task as not found', async () => {
    const error = await rejection(
      completeTaskTool.execute?.({ taskId: 'missing' }),
    )

    expectNotFound(error, 'No task with id missing.')
  })

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(completeTaskTool, { taskId: 't1', done: true }),
    )

    expectValidation(error, 'done')
  })
})

describe('delete_task', () => {
  it('returns the task and deletes it', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const task = await createTask(project.id, { title: 'Ship' })

    const result = await deleteTaskTool.execute?.({ taskId: task.id })

    expect(result).toMatchObject({ id: task.id, title: 'Ship' })
    expectOutput(deleteTaskTool.outputSchema, result)
    await expect(getTask(task.id)).rejects.toThrow('No task with id')
  })

  it('reports an unknown task as not found', async () => {
    const error = await rejection(
      deleteTaskTool.execute?.({ taskId: 'missing' }),
    )

    expectNotFound(error, 'No task with id missing.')
  })

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(deleteTaskTool, { taskId: 't1', force: true }),
    )

    expectValidation(error, 'force')
  })
})

/** A project with one task, for the subtask and comment tools. */
async function createTaskInProject() {
  const project = await createProject({ name: 'Website', key: 'SITE' })
  return createTask(project.id, { title: 'Fix the header' })
}

describe('list_subtasks', () => {
  it("returns the task's subtasks top to bottom", async () => {
    const task = await createTaskInProject()
    await addSubtask(task.id, { title: 'Draft' })
    await addSubtask(task.id, { title: 'Review' })

    const result = await listSubtasksTool.execute?.({ taskId: task.id })

    expect(result?.subtasks.map((subtask) => subtask.title)).toEqual([
      'Draft',
      'Review',
    ])
    expectOutput(listSubtasksTool.outputSchema, result)
  })

  it('reports an unknown task as not found', async () => {
    const error = await rejection(
      listSubtasksTool.execute?.({ taskId: 'missing' }),
    )

    expectNotFound(error, 'No task with id missing.')
  })

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(listSubtasksTool, { taskId: 't1', done: false }),
    )

    expectValidation(error, 'done')
  })

  it('reports a blank task id in readable words', async () => {
    const error = await rejection(listSubtasksTool.execute?.({ taskId: '' }))

    expectValidation(error, '→ at taskId')
  })
})

describe('add_subtask', () => {
  it('adds the subtask at the end, not done', async () => {
    const task = await createTaskInProject()
    await addSubtask(task.id, { title: 'Draft' })

    const result = await addSubtaskTool.execute?.({
      taskId: task.id,
      title: ' Review ',
    })

    expect(result).toMatchObject({
      taskId: task.id,
      title: 'Review',
      done: false,
    })
    expectOutput(addSubtaskTool.outputSchema, result)
    expect((await listSubtasks(task.id)).map((row) => row.title)).toEqual([
      'Draft',
      'Review',
    ])
  })

  it('reports an unknown task as not found', async () => {
    const error = await rejection(
      addSubtaskTool.execute?.({ taskId: 'missing', title: 'Draft' }),
    )

    expectNotFound(error, 'No task with id missing.')
  })

  it('reports a blank title in readable words', async () => {
    const error = await rejection(
      addSubtaskTool.execute?.({ taskId: 't1', title: '  ' }),
    )

    expectValidation(error, 'Title is required.', '→ at title')
  })
})

describe('update_subtask', () => {
  it('changes the title and ticks the subtask off', async () => {
    const task = await createTaskInProject()
    const subtask = await addSubtask(task.id, { title: 'Draft' })

    const result = await updateSubtaskTool.execute?.({
      subtaskId: subtask.id,
      title: 'Draft the intro',
      done: true,
    })

    expect(result).toMatchObject({
      id: subtask.id,
      title: 'Draft the intro',
      done: true,
    })
    expectOutput(updateSubtaskTool.outputSchema, result)
  })

  it('reports an unknown subtask as not found', async () => {
    const error = await rejection(
      updateSubtaskTool.execute?.({ subtaskId: 'missing', done: true }),
    )

    expectNotFound(error, 'No subtask with id missing.')
  })

  it('reports a done that is not true or false in readable words', async () => {
    const error = await rejection(
      callUnchecked(updateSubtaskTool, { subtaskId: 's1', done: 'yes' }),
    )

    expectValidation(error, 'Done must be true or false.', '→ at done')
  })

  it('reports a blank title in readable words', async () => {
    const error = await rejection(
      updateSubtaskTool.execute?.({ subtaskId: 's1', title: ' ' }),
    )

    expectValidation(error, 'Title is required.', '→ at title')
  })
})

describe('move_subtask', () => {
  it('puts the subtask first at index 0', async () => {
    const task = await createTaskInProject()
    await addSubtask(task.id, { title: 'Draft' })
    const last = await addSubtask(task.id, { title: 'Review' })

    const result = await moveSubtaskTool.execute?.({
      subtaskId: last.id,
      index: 0,
    })
    const list = await listSubtasksTool.execute?.({ taskId: task.id })

    expect(result).toMatchObject({ id: last.id, order: 1 })
    expectOutput(moveSubtaskTool.outputSchema, result)
    expect(list?.subtasks.map((subtask) => subtask.title)).toEqual([
      'Review',
      'Draft',
    ])
  })

  it('puts the subtask last at an index past the end', async () => {
    const task = await createTaskInProject()
    const first = await addSubtask(task.id, { title: 'Draft' })
    await addSubtask(task.id, { title: 'Review' })

    await moveSubtaskTool.execute?.({ subtaskId: first.id, index: 10 })
    const list = await listSubtasksTool.execute?.({ taskId: task.id })

    expect(list?.subtasks.map((subtask) => subtask.title)).toEqual([
      'Review',
      'Draft',
    ])
  })

  it('reports an unknown subtask as not found', async () => {
    const error = await rejection(
      moveSubtaskTool.execute?.({ subtaskId: 'missing', index: 0 }),
    )

    expectNotFound(error, 'No subtask with id missing.')
  })

  it('reports a negative index in readable words', async () => {
    const error = await rejection(
      moveSubtaskTool.execute?.({ subtaskId: 's1', index: -1 }),
    )

    expectValidation(error, 'Index must be 0 or more.', '→ at index')
  })
})

describe('delete_subtask', () => {
  it('returns the subtask and deletes it', async () => {
    const task = await createTaskInProject()
    const subtask = await addSubtask(task.id, { title: 'Draft' })

    const result = await deleteSubtaskTool.execute?.({ subtaskId: subtask.id })

    expect(result).toMatchObject({ id: subtask.id, title: 'Draft' })
    expectOutput(deleteSubtaskTool.outputSchema, result)
    expect(await listSubtasks(task.id)).toEqual([])
  })

  it('reports an unknown subtask as not found', async () => {
    const error = await rejection(
      deleteSubtaskTool.execute?.({ subtaskId: 'missing' }),
    )

    expectNotFound(error, 'No subtask with id missing.')
  })

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(deleteSubtaskTool, { subtaskId: 's1', force: true }),
    )

    expectValidation(error, 'force')
  })

  it('reports a blank subtask id in readable words', async () => {
    const error = await rejection(
      deleteSubtaskTool.execute?.({ subtaskId: '' }),
    )

    expectValidation(error, '→ at subtaskId')
  })
})

describe('list_labels', () => {
  it("returns the project's labels sorted by name", async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    await createLabel(project.id, { name: 'UX', color: '#2563eb' })
    await createLabel(project.id, { name: 'Bug', color: '#dc2626' })

    const result = await listLabelsTool.execute?.({ projectId: project.id })

    expect(result?.labels.map((label) => label.name)).toEqual(['Bug', 'UX'])
    expectOutput(listLabelsTool.outputSchema, result)
  })

  it('reports an unknown project as not found', async () => {
    const error = await rejection(
      listLabelsTool.execute?.({ projectId: 'missing' }),
    )

    expectNotFound(error, 'No project with id missing.')
  })

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(listLabelsTool, { projectId: 'p1', name: 'Bug' }),
    )

    expectValidation(error, 'name')
  })

  it('reports a blank project id in readable words', async () => {
    const error = await rejection(listLabelsTool.execute?.({ projectId: '' }))

    expectValidation(error, '→ at projectId')
  })
})

describe('create_label', () => {
  it('creates the label with its colour in lower case', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })

    const result = await createLabelTool.execute?.({
      projectId: project.id,
      name: ' Bug ',
      color: '#DC2626',
    })

    expect(result).toMatchObject({
      projectId: project.id,
      name: 'Bug',
      color: '#dc2626',
    })
    expectOutput(createLabelTool.outputSchema, result)
  })

  it('reports an unknown project as not found', async () => {
    const error = await rejection(
      createLabelTool.execute?.({
        projectId: 'missing',
        name: 'Bug',
        color: '#dc2626',
      }),
    )

    expectNotFound(error, 'No project with id missing.')
  })

  it('reports a name taken in another case as a conflict', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    await createLabel(project.id, { name: 'Bug', color: '#dc2626' })

    const error = await rejection(
      createLabelTool.execute?.({
        projectId: project.id,
        name: 'bug',
        color: '#2563eb',
      }),
    )

    expect(error).toBeInstanceOf(ToolError)
    expect(error).toMatchObject({
      code: 'conflict',
      message: 'A label named Bug already exists in this project.',
    })
  })

  it('reports a colour outside the palette in readable words', async () => {
    const error = await rejection(
      createLabelTool.execute?.({
        projectId: 'p1',
        name: 'Bug',
        color: '#123456',
      }),
    )

    expectValidation(error, 'Colour must be one of the project colours.')
  })

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(createLabelTool, {
        projectId: 'p1',
        name: 'Bug',
        color: '#dc2626',
        description: 'Something is broken',
      }),
    )

    expectValidation(error, 'description')
  })
})

describe('list_comments', () => {
  it("returns the task's comments oldest first", async () => {
    const task = await createTaskInProject()
    await addComment(task.id, { body: 'First' })
    await addComment(task.id, { body: 'Second' })

    const result = await listCommentsTool.execute?.({ taskId: task.id })

    expect(result?.comments.map((comment) => comment.body)).toEqual([
      'First',
      'Second',
    ])
    expectOutput(listCommentsTool.outputSchema, result)
  })

  it('reports an unknown task as not found', async () => {
    const error = await rejection(
      listCommentsTool.execute?.({ taskId: 'missing' }),
    )

    expectNotFound(error, 'No task with id missing.')
  })

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(listCommentsTool, { taskId: 't1', limit: 5 }),
    )

    expectValidation(error, 'limit')
  })

  it('reports a blank task id in readable words', async () => {
    const error = await rejection(listCommentsTool.execute?.({ taskId: '' }))

    expectValidation(error, '→ at taskId')
  })
})

describe('add_comment', () => {
  it('adds the comment with ISO timestamps', async () => {
    const task = await createTaskInProject()

    const result = await addCommentTool.execute?.({
      taskId: task.id,
      body: ' Looks good ',
    })

    expect(result).toMatchObject({ taskId: task.id, body: 'Looks good' })
    expect(result?.createdAt).toBe(
      (await listComments(task.id))[0].createdAt.toISOString(),
    )
    expectOutput(addCommentTool.outputSchema, result)
  })

  it('reports an unknown task as not found', async () => {
    const error = await rejection(
      addCommentTool.execute?.({ taskId: 'missing', body: 'Hi' }),
    )

    expectNotFound(error, 'No task with id missing.')
  })

  it('reports a blank body in readable words', async () => {
    const error = await rejection(
      addCommentTool.execute?.({ taskId: 't1', body: ' ' }),
    )

    expectValidation(error, 'Comment is required.', '→ at body')
  })
})

describe('update_comment', () => {
  it('replaces the body', async () => {
    const task = await createTaskInProject()
    const comment = await addComment(task.id, { body: 'Looks good' })

    const result = await updateCommentTool.execute?.({
      commentId: comment.id,
      body: 'Looks great',
    })

    expect(result).toMatchObject({ id: comment.id, body: 'Looks great' })
    expectOutput(updateCommentTool.outputSchema, result)
  })

  it('changes nothing when given the current body', async () => {
    const task = await createTaskInProject()
    const comment = await addComment(task.id, { body: 'Looks good' })
    const activities = await db.activity.count()

    const result = await updateCommentTool.execute?.({
      commentId: comment.id,
      body: ' Looks good ',
    })

    expect(result).toMatchObject({
      id: comment.id,
      body: 'Looks good',
      updatedAt: comment.updatedAt.toISOString(),
    })
    expect(await db.activity.count()).toBe(activities)
  })

  it('reports an unknown comment as not found', async () => {
    const error = await rejection(
      updateCommentTool.execute?.({ commentId: 'missing', body: 'Hi' }),
    )

    expectNotFound(error, 'No comment with id missing.')
  })

  it('reports a missing body in readable words', async () => {
    const error = await rejection(
      callUnchecked(updateCommentTool, { commentId: 'c1' }),
    )

    expectValidation(error, '→ at body')
  })
})

describe('delete_comment', () => {
  it('returns the comment and deletes it', async () => {
    const task = await createTaskInProject()
    const comment = await addComment(task.id, { body: 'Looks good' })

    const result = await deleteCommentTool.execute?.({ commentId: comment.id })

    expect(result).toMatchObject({ id: comment.id, body: 'Looks good' })
    expectOutput(deleteCommentTool.outputSchema, result)
    expect(await listComments(task.id)).toEqual([])
  })

  it('reports an unknown comment as not found', async () => {
    const error = await rejection(
      deleteCommentTool.execute?.({ commentId: 'missing' }),
    )

    expectNotFound(error, 'No comment with id missing.')
  })

  it('reports an unknown option in readable words', async () => {
    const error = await rejection(
      callUnchecked(deleteCommentTool, { commentId: 'c1', force: true }),
    )

    expectValidation(error, 'force')
  })

  it('reports a blank comment id in readable words', async () => {
    const error = await rejection(
      deleteCommentTool.execute?.({ commentId: '' }),
    )

    expectValidation(error, '→ at commentId')
  })
})
