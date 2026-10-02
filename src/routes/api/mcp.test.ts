// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Route } from '#/routes/api/mcp'
import { db } from '#/server/db'
import { archiveProject, createProject } from '#/server/projects'
import { createTask } from '#/server/tasks'
import { resetDatabase } from '#/test/db'
import { fetchRoute } from '#/test/rest'
import { listProjectsTool } from '#/tools/server'

beforeEach(() => resetDatabase(db))

const clients: Array<Client> = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

/** Every response the route sent, so a test can read its headers. */
let responses: Array<Response> = []

beforeEach(() => {
  responses = []
})

/** An SDK client whose requests go to the route's handlers in process. */
async function connect() {
  const send = fetchRoute(Route)
  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost/api/mcp'),
    {
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
  it('lists the five read tools with their schemas', async () => {
    const client = await connect()

    const { tools } = await client.listTools()

    expect(tools.map((tool) => tool.name)).toEqual([
      'list_projects',
      'get_project',
      'list_tasks',
      'get_task',
      'search',
    ])
    for (const tool of tools) {
      expect(tool.description).toEqual(expect.any(String))
      expect(tool.inputSchema).toMatchObject({ type: 'object' })
      expect(tool.outputSchema).toMatchObject({ type: 'object' })
    }
  })

  it('leaves the write tools off until F36', async () => {
    const client = await connect()

    const names = (await client.listTools()).tools.map((tool) => tool.name)

    expect(names).not.toContain('archive_project')
    expect(names).not.toContain('delete_task')
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
