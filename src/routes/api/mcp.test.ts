// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from '#/routes/api/mcp'
import { addComment, listComments } from '#/server/comments'
import { db } from '#/server/db'
import { createLabel } from '#/server/labels'
import { archiveProject, createProject, getProject } from '#/server/projects'
import { addSubtask, listSubtasks } from '#/server/subtasks'
import { createTask, getTask } from '#/server/tasks'
import { resetDatabase } from '#/test/db'
import { fetchRoute } from '#/test/rest'
import {
  deleteTaskTool,
  listProjectsTool,
  moveTaskTool,
  readServerTools,
  serverTools,
} from '#/tools/server'

beforeEach(() => resetDatabase(db))

const clients: Array<Client> = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

/** Every response the route sent, so a test can read its headers. */
let responses: Array<Response> = []

beforeEach(() => {
  responses = []
})

/**
 * An SDK client whose requests go to the route's handlers in process. With a
 * host, every request carries it as its Host header.
 */
async function connect(host?: string) {
  const send = fetchRoute(Route)
  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost/api/mcp'),
    {
      requestInit: host ? { headers: { host } } : undefined,
      fetch: async (input, init) => {
        const response = await send(input, init)
        responses.push(response)
        return response
      },
    },
  )
  const client = new Client({ name: 'mcp-test', version: '1.0.0' })
  await client.connect(transport)
  clients.push(client)
  return client
}

/** A raw JSON-RPC POST to the route, as a client other than the SDK's sends it. */
function post(message: object, headers: Record<string, string> = {}) {
  return fetchRoute(Route)('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...message }),
  })
}

/** The text of a tool result's first content item. */
function textOf(result: unknown) {
  const [first] = (result as { content: Array<{ type: string; text: string }> })
    .content
  expect(first.type).toBe('text')
  return first.text
}

/** The project names in a list_projects result. */
function projectNames(result: unknown) {
  const { projects } = (
    result as { structuredContent: { projects: Array<{ name: string }> } }
  ).structuredContent
  return projects.map((project) => project.name)
}

describe('/api/mcp', () => {
  it('lists every tool with its schemas and annotations', async () => {
    // Only these write tools add rows without overwriting, clearing, moving or
    // removing any; every other write tool is destructive.
    const additive = [
      'create_project',
      'create_task',
      'add_subtask',
      'create_label',
      'add_comment',
    ]
    const client = await connect()

    const { tools } = await client.listTools()

    expect(tools.map((tool) => tool.name)).toEqual(
      serverTools.map((tool) => tool.name),
    )
    expect(tools).toHaveLength(23)
    for (const tool of tools) {
      const readOnly = readServerTools.some((each) => each.name === tool.name)
      expect(tool.description).toEqual(expect.any(String))
      expect(tool.inputSchema).toMatchObject({ type: 'object' })
      expect(tool.outputSchema).toMatchObject({ type: 'object' })
      expect(tool.annotations).toEqual(
        readOnly
          ? { readOnlyHint: true, openWorldHint: false }
          : {
              readOnlyHint: false,
              destructiveHint: !additive.includes(tool.name),
              openWorldHint: false,
            },
      )
    }
    expect(
      tools
        .filter((tool) => tool.annotations?.destructiveHint === true)
        .map((tool) => tool.name),
    ).toEqual([
      'archive_project',
      'update_task',
      'move_task',
      'complete_task',
      'delete_task',
      'update_subtask',
      'move_subtask',
      'delete_subtask',
      'update_comment',
      'delete_comment',
    ])
  })

  it('gives the four destructive tools, and only them, a confirm argument', async () => {
    const needingApproval = [
      'archive_project',
      'delete_task',
      'delete_subtask',
      'delete_comment',
    ]
    // A flag dropped on the served tools fails here instead of leaving both
    // sides of the checks below empty.
    expect(
      serverTools.filter((tool) => tool.needsApproval).map((tool) => tool.name),
    ).toEqual(needingApproval)
    const client = await connect()

    const { tools } = await client.listTools()

    for (const tool of tools) {
      const properties = tool.inputSchema.properties ?? {}
      if (needingApproval.includes(tool.name)) {
        expect(properties).toHaveProperty('confirm')
        expect(properties.confirm).toMatchObject({ type: 'boolean' })
        expect(tool.inputSchema.required ?? []).not.toContain('confirm')
        expect(tool.annotations?.destructiveHint).toBe(true)
        expect(tool.description).toContain('confirm: true')
      } else {
        expect(properties).not.toHaveProperty('confirm')
      }
    }
  })

  it('keeps no session between requests', async () => {
    const first = await connect()
    const second = await connect()

    await first.listTools()
    await second.listTools()

    expect(responses.length).toBeGreaterThan(0)
    for (const response of responses) {
      expect(response.headers.has('mcp-session-id')).toBe(false)
    }
  })

  it('returns projects from list_projects as structured content', async () => {
    await createProject({ name: 'Website', key: 'SITE' })
    const old = await createProject({ name: 'Archive me', key: 'OLD' })
    await archiveProject(old.id)
    const client = await connect()

    const open = await client.callTool({
      name: 'list_projects',
      arguments: {},
    })
    const all = await client.callTool({
      name: 'list_projects',
      arguments: { includeArchived: true },
    })

    expect(open.isError).toBeFalsy()
    expect(projectNames(open)).toEqual(['Website'])
    expect(listProjectsTool.outputSchema.parse(open.structuredContent)).toEqual(
      open.structuredContent,
    )
    expect(JSON.parse(textOf(open))).toEqual(open.structuredContent)
    expect(projectNames(all)).toEqual(['Archive me', 'Website'])
  })

  it('treats a call without arguments as empty arguments', async () => {
    await createProject({ name: 'Website', key: 'SITE' })

    // Posted by hand, so the params have no arguments key at all.
    const response = await post({
      method: 'tools/call',
      params: { name: 'list_projects' },
    })

    expect(response.status).toBe(200)
    const { result } = (await response.json()) as { result: unknown }
    expect(result).not.toHaveProperty('isError')
    expect(projectNames(result)).toEqual(['Website'])
  })

  it('reads a task through list_tasks, get_task and search', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const task = await createTask(project.id, { title: 'Fix the header' })
    const client = await connect()

    const listed = await client.callTool({
      name: 'list_tasks',
      arguments: { projectId: project.id },
    })
    const read = await client.callTool({
      name: 'get_task',
      arguments: { taskId: task.id },
    })
    const found = await client.callTool({
      name: 'search',
      arguments: { query: 'header' },
    })

    expect(listed.structuredContent).toMatchObject({
      tasks: [{ id: task.id, title: 'Fix the header' }],
    })
    expect(read.structuredContent).toMatchObject({
      id: task.id,
      status: { name: 'Backlog' },
    })
    expect(found.structuredContent).toMatchObject({
      tasks: [{ id: task.id }],
    })
  })

  it('returns labels from list_labels as structured content', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    await createLabel(project.id, { name: 'UX', color: '#2563eb' })
    await createLabel(project.id, { name: 'Bug', color: '#dc2626' })
    const client = await connect()

    const result = await client.callTool({
      name: 'list_labels',
      arguments: { projectId: project.id },
    })

    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toMatchObject({
      labels: [
        { projectId: project.id, name: 'Bug', color: '#dc2626' },
        { projectId: project.id, name: 'UX', color: '#2563eb' },
      ],
    })
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent)
  })

  it('returns comments from list_comments with ISO dates', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const task = await createTask(project.id, { title: 'Fix the header' })
    const comment = await addComment(task.id, { body: 'Looks good' })
    const client = await connect()

    // The client checks the result against the tool's listed output schema.
    const result = await client.callTool({
      name: 'list_comments',
      arguments: { taskId: task.id },
    })

    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toEqual({
      comments: [
        {
          id: comment.id,
          taskId: task.id,
          body: 'Looks good',
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString(),
        },
      ],
    })
  })

  it('moves a task through move_task', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const task = await createTask(project.id, { title: 'Fix the header' })
    const done = project.statuses.find((status) => status.name === 'Done')
    const client = await connect()

    const result = await client.callTool({
      name: 'move_task',
      arguments: { taskId: task.id, statusId: done?.id },
    })

    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toMatchObject({
      id: task.id,
      status: { name: 'Done' },
      completedAt: expect.any(String),
    })
    expect(moveTaskTool.outputSchema.parse(result.structuredContent)).toEqual(
      result.structuredContent,
    )
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent)
  })

  it('refuses delete_task without confirm: true and keeps the task', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const task = await createTask(project.id, { title: 'Fix the header' })
    const client = await connect()

    for (const args of [
      { taskId: task.id },
      { taskId: task.id, confirm: false },
    ]) {
      const result = await client.callTool({
        name: 'delete_task',
        arguments: args,
      })

      expect(result.isError).toBe(true)
      expect(result.structuredContent).toBeUndefined()
      expect(textOf(result)).toBe(
        "confirmation_required: delete_task needs the user's approval. Ask the user, then call it again with confirm: true.",
      )
    }
    await expect(getTask(task.id)).resolves.toMatchObject({ id: task.id })
  })

  it('deletes the task with confirm: true', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const task = await createTask(project.id, { title: 'Fix the header' })
    const client = await connect()

    const result = await client.callTool({
      name: 'delete_task',
      arguments: { taskId: task.id, confirm: true },
    })

    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toMatchObject({
      id: task.id,
      title: 'Fix the header',
    })
    expect(deleteTaskTool.outputSchema.parse(result.structuredContent)).toEqual(
      result.structuredContent,
    )
    await expect(getTask(task.id)).rejects.toThrow(task.id)
  })

  it('refuses the other destructive tools without confirm, then runs them with it', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const task = await createTask(project.id, { title: 'Fix the header' })
    const subtask = await addSubtask(task.id, { title: 'Check the logo' })
    const comment = await addComment(task.id, { body: 'Looks good' })
    const client = await connect()
    const cases = [
      {
        name: 'archive_project',
        args: { projectId: project.id },
        id: project.id,
        isUnchanged: async () =>
          (await getProject(project.id)).archivedAt === null,
      },
      {
        name: 'delete_subtask',
        args: { subtaskId: subtask.id },
        id: subtask.id,
        isUnchanged: async () => (await listSubtasks(task.id)).length === 1,
      },
      {
        name: 'delete_comment',
        args: { commentId: comment.id },
        id: comment.id,
        isUnchanged: async () => (await listComments(task.id)).length === 1,
      },
    ]

    for (const { name, args, id, isUnchanged } of cases) {
      const refused = await client.callTool({ name, arguments: args })

      expect(refused.isError).toBe(true)
      expect(refused.structuredContent).toBeUndefined()
      expect(textOf(refused)).toMatch(/^confirmation_required: /)
      expect(await isUnchanged()).toBe(true)

      const confirmed = await client.callTool({
        name,
        arguments: { ...args, confirm: true },
      })

      expect(confirmed.isError).toBeFalsy()
      expect(confirmed.structuredContent).toMatchObject({ id })
      expect(await isUnchanged()).toBe(false)
    }
  })

  it('refuses a confirm that is not a boolean with an input error', async () => {
    const project = await createProject({ name: 'Website', key: 'SITE' })
    const task = await createTask(project.id, { title: 'Fix the header' })
    const client = await connect()

    const result = await client.callTool({
      name: 'delete_task',
      arguments: { taskId: task.id, confirm: 'yes' },
    })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('MCP error -32602: Input validation error')
    expect(textOf(result)).toContain('confirm')
    await expect(getTask(task.id)).resolves.toMatchObject({ id: task.id })
  })

  it('reports an unexpected error in a confirmed delete as internal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(deleteTaskTool, 'execute').mockRejectedValue(
      new Error('connection to postgres://secret failed'),
    )
    const client = await connect()

    const result = await client.callTool({
      name: 'delete_task',
      arguments: { taskId: 'any', confirm: true },
    })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('internal: Something went wrong on the server.')
  })

  it('reports an unknown project as an error result with its code', async () => {
    const client = await connect()

    const result = await client.callTool({
      name: 'get_project',
      arguments: { projectId: 'missing' },
    })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
    expect(textOf(result)).toBe('not_found: No project with id missing.')
  })

  it('reports an unexpected error as internal, without its message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(listProjectsTool, 'execute').mockRejectedValue(
      new Error('connection to postgres://secret failed'),
    )
    const client = await connect()

    const result = await client.callTool({
      name: 'list_projects',
      arguments: {},
    })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('internal: Something went wrong on the server.')
  })

  it('refuses an unknown argument with an error result', async () => {
    const client = await connect()

    // SDK 1.x validates the input itself and reports a failure as an isError
    // result, not a rejected request.
    const result = await client.callTool({
      name: 'list_projects',
      arguments: { archived: true },
    })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('MCP error -32602: Input validation error')
    expect(textOf(result)).toContain('archived')
  })

  it('accepts a loopback Host header on any port', async () => {
    for (const host of ['localhost:5173', '127.0.0.1:3100', '[::1]:4000']) {
      const client = await connect(host)

      const { tools } = await client.listTools()

      expect(tools).toHaveLength(serverTools.length)
    }
  })

  it('refuses any other Host header with a 403 JSON-RPC error', async () => {
    for (const host of ['evil.example', 'localhost.evil.example:5173']) {
      const response = await post({ method: 'tools/list' }, { host })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Only localhost may use this server.' },
        id: null,
      })
    }
  })

  it('answers GET and DELETE with a 405 JSON-RPC error', async () => {
    const send = fetchRoute(Route)

    for (const method of ['GET', 'DELETE']) {
      const response = await send('http://localhost/api/mcp', { method })

      expect(response.status).toBe(405)
      expect(response.headers.has('mcp-session-id')).toBe(false)
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      })
    }
  })
})
