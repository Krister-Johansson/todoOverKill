// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from '#/routes/api/mcp'
import { db } from '#/server/db'
import { createLabel } from '#/server/labels'
import { archiveProject, createProject } from '#/server/projects'
import { createTask } from '#/server/tasks'
import { resetDatabase } from '#/test/db'
import { fetchRoute } from '#/test/rest'
import { listProjectsTool, readServerTools, serverTools } from '#/tools/server'

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
  it('lists the eight read tools with their schemas', async () => {
    const client = await connect()

    const { tools } = await client.listTools()

    expect(tools.map((tool) => tool.name)).toEqual([
      'list_projects',
      'get_project',
      'list_tasks',
      'get_task',
      'search',
      'list_subtasks',
      'list_labels',
      'list_comments',
    ])
    for (const tool of tools) {
      expect(tool.description).toEqual(expect.any(String))
      expect(tool.inputSchema).toMatchObject({ type: 'object' })
      expect(tool.outputSchema).toMatchObject({ type: 'object' })
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        openWorldHint: false,
      })
    }
  })

  it('leaves the write tools off until F36', async () => {
    const client = await connect()
    const writeNames = serverTools
      .map((tool) => tool.name)
      .filter((name) => !readServerTools.some((tool) => tool.name === name))

    const names = (await client.listTools()).tools.map((tool) => tool.name)

    const needingApproval = [
      'archive_project',
      'delete_task',
      'delete_subtask',
      'delete_comment',
    ]
    expect(writeNames).toEqual(expect.arrayContaining(needingApproval))
    for (const name of needingApproval) {
      expect(names).not.toContain(name)
    }
    for (const name of writeNames) {
      expect(names).not.toContain(name)
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

      expect(tools).toHaveLength(readServerTools.length)
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
