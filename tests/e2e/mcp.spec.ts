import { randomUUID } from 'node:crypto'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'

import { createTestPrismaClient } from '../../src/test/db.ts'

// The Vitest MCP tests call the route's handlers through the client's fetch
// option. This spec connects the SDK client to the preview server, so it
// catches a route that is missing from the route tree.
//
// The project is created through REST with a key no other spec uses, and
// removed at the end, as in api.spec.ts.
const run = randomUUID().slice(0, 4).toUpperCase()
const key = `M${run}`
const name = `MCP ${run}`

const db = createTestPrismaClient()

test.afterAll(async () => {
  await db.task.deleteMany({ where: { project: { key } } })
  await db.project.deleteMany({ where: { key } })
  await db.$disconnect()
})

test('the MCP server answers through the router', async ({
  request,
  baseURL,
}) => {
  const created = await request.post('/api/v1/projects', {
    data: { name, key },
  })
  expect(created.status()).toBe(201)
  const project = await created.json()
  const task = await request.post(`/api/v1/projects/${project.id}/tasks`, {
    data: { title: `Check the MCP route ${run}` },
  })
  expect(task.status()).toBe(201)

  const client = new Client({ name: 'mcp-e2e', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/api/mcp', baseURL)),
  )
  try {
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).toEqual([
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

    const result = await client.callTool({
      name: 'search',
      arguments: { query: `MCP route ${run}` },
    })
    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toMatchObject({
      tasks: [{ title: `Check the MCP route ${run}`, project: { key } }],
    })

    const taskId = (await task.json()).id
    const refused = await client.callTool({
      name: 'delete_task',
      arguments: { taskId },
    })
    expect(refused.isError).toBe(true)
    expect(refused.content).toEqual([
      {
        type: 'text',
        text: expect.stringMatching(/^confirmation_required: /),
      },
    ])

    const deleted = await client.callTool({
      name: 'delete_task',
      arguments: { taskId, confirm: true },
    })
    expect(deleted.isError).toBeFalsy()
    expect(deleted.structuredContent).toMatchObject({
      id: taskId,
      title: `Check the MCP route ${run}`,
    })
  } finally {
    await client.close()
  }

  const get = await request.get('/api/mcp')
  expect(get.status()).toBe(405)
  expect(get.headers()['mcp-session-id']).toBeUndefined()
})
