import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import type {
  CallToolResult,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'

import { toCalendarDay } from '#/lib/dates'
import { dueDateSchema } from '#/schemas/task'
import { listComments } from '#/server/comments'
import { listDashboardTasks } from '#/server/dashboard'
import { listLabels } from '#/server/labels'
import { getProject } from '#/server/projects'
import { listSubtasks } from '#/server/subtasks'
import { getTask, listTasks } from '#/server/tasks'
import { ToolError, toToolError } from '#/tools/errors'
import { dailyReviewText } from '#/tools/prompts'
import { projectMarkdown, taskMarkdown } from '#/tools/resources'
import { readServerTools, serverTools } from '#/tools/server'

/** The part of a server tool the MCP server needs. */
type ServedTool = {
  name: string
  description: string
  inputSchema?: z.ZodObject
  outputSchema?: z.ZodObject
  execute?: (args: never) => Promise<unknown>
  needsApproval?: boolean
}

/** An error as an MCP result: isError, with the code and message as text. */
function errorResult(error: ToolError): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: `${error.code}: ${error.message}` }],
  }
}

/**
 * Calls the tool and wraps its result for MCP: the JSON as text, for clients
 * that only read content, and the same object as structuredContent, which the
 * SDK checks against the output schema. An error becomes an isError result
 * with its code and message, so the model reads what to fix. toToolError maps
 * anything that is not already a ToolError, so an unexpected error reaches
 * the client as the generic internal message, never its own text.
 */
async function callTool(
  tool: ServedTool,
  args: unknown,
): Promise<CallToolResult> {
  try {
    const result = (await tool.execute?.(args as never)) as Record<
      string,
      unknown
    >
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    }
  } catch (caught) {
    return errorResult(toToolError(caught))
  }
}

const readToolNames = new Set<string>(readServerTools.map((tool) => tool.name))

/**
 * The write tools that only add rows. Every other write tool overwrites,
 * clears, moves or removes data, so a tool missing from this list is
 * destructive, as the MCP default has it.
 */
const additiveToolNames = new Set<string>([
  'create_project',
  'create_task',
  'add_subtask',
  'create_label',
  'add_comment',
])

/**
 * Read tools are read only. Write tools are not, and all but the ones that
 * only add rows are destructive. Every tool is closed world: it touches only
 * this app's database.
 */
function annotationsFor(tool: ServedTool) {
  if (readToolNames.has(tool.name)) {
    return { readOnlyHint: true, openWorldHint: false }
  }
  return {
    readOnlyHint: false,
    destructiveHint: !additiveToolNames.has(tool.name),
    openWorldHint: false,
  }
}

/**
 * The input schema and description for a tool that needs approval, over MCP.
 * The assistant asks the user with its own Approve and Deny prompt (F40); an
 * MCP client has none the server can see, so the tool takes a confirm
 * argument that the model sets once the user has agreed. confirm is optional
 * rather than literally true, so a call without it reaches the handler and
 * gets the confirmation_required refusal instead of the SDK's input error.
 * Zod's .extend() throws on a schema with refinements, and this runs for
 * every request, so an approval tool's input schema must have none.
 */
function withConfirm(tool: ServedTool) {
  const inputSchema = (tool.inputSchema ?? z.strictObject({})).extend({
    confirm: z
      .boolean()
      .optional()
      .describe(
        'Set to true only after the user has approved this call. Without it the call is refused with confirmation_required.',
      ),
  })
  const description = `${tool.description} Over MCP, pass confirm: true once the user has approved it; without it the call is refused with confirmation_required.`
  return { inputSchema, description }
}

/** The refusal for a tool that needs approval, called without confirm: true. */
function confirmationRequired(tool: ServedTool) {
  return errorResult(
    new ToolError(
      'confirmation_required',
      `${tool.name} needs the user's approval. Ask the user, then call it again with confirm: true.`,
    ),
  )
}

/**
 * An error as a JSON-RPC error, for resource reads and prompts, which have no
 * isError result. not_found, conflict and validation are InvalidParams with
 * the same code-prefixed text a tool returns. Anything else goes through
 * toToolError, which logs it, and reaches the client as the generic internal
 * message, never its own text.
 */
function requestError(caught: unknown) {
  const error = toToolError(caught)
  const text = `${error.code}: ${error.message}`
  return error.code === 'internal'
    ? new McpError(ErrorCode.InternalError, text)
    : new McpError(ErrorCode.InvalidParams, text)
}

/** Runs a resource read or a prompt, with its errors as requestError has them. */
async function answer<T>(work: () => Promise<T>) {
  try {
    return await work()
  } catch (caught) {
    throw requestError(caught)
  }
}

/**
 * The id in a resource URI, decoded. A {id} variable always matches one
 * segment, but the SDK types it as a string or a list, so a list is refused.
 */
function idOf(variables: Variables) {
  const { id } = variables
  if (typeof id !== 'string') {
    throw new ToolError('validation', 'The resource URI must hold one id.')
  }
  try {
    return decodeURIComponent(id)
  } catch {
    throw new ToolError('validation', `The id ${id} is not a valid URI part.`)
  }
}

const MARKDOWN = 'text/markdown'

/**
 * project://{id} and task://{id} as Markdown (F37), read through the same
 * services as the tools. The ids are not listed: resources/list stays empty
 * and a client finds ids with list_projects, list_tasks or search.
 */
function registerResources(server: McpServer) {
  server.registerResource(
    'project',
    new ResourceTemplate('project://{id}', { list: undefined }),
    {
      title: 'Project',
      description:
        'A project as Markdown: its description, statuses, labels, and tasks grouped by status.',
      mimeType: MARKDOWN,
    },
    (uri, variables) =>
      answer(async () => {
        const project = await getProject(idOf(variables))
        const [tasks, labels] = await Promise.all([
          listTasks(project.id),
          listLabels(project.id),
        ])
        const text = projectMarkdown({ project, tasks, labels })
        return { contents: [{ uri: uri.href, mimeType: MARKDOWN, text }] }
      }),
  )
  server.registerResource(
    'task',
    new ResourceTemplate('task://{id}', { list: undefined }),
    {
      title: 'Task',
      description:
        'A task as Markdown: its fields, description, subtasks as checkboxes, and comments.',
      mimeType: MARKDOWN,
    },
    (uri, variables) =>
      answer(async () => {
        const task = await getTask(idOf(variables))
        const [project, subtasks, comments] = await Promise.all([
          getProject(task.projectId),
          listSubtasks(task.id),
          listComments(task.id),
        ])
        const text = taskMarkdown({ task, project, subtasks, comments })
        return { contents: [{ uri: uri.href, mimeType: MARKDOWN, text }] }
      }),
  )
}

/**
 * The daily_review prompt (F37): the tasks due today and the overdue ones
 * across unarchived projects, as one user message. today defaults to the
 * server's local day, as the dashboard's does.
 */
function registerPrompts(server: McpServer) {
  server.registerPrompt(
    'daily_review',
    {
      title: 'Daily review',
      description:
        'Summarises the tasks due today and the overdue ones across unarchived projects, and asks what to do first.',
      argsSchema: {
        today: z
          .string()
          .optional()
          .describe(
            "The day as YYYY-MM-DD. Defaults to the server's current day.",
          ),
      },
    },
    ({ today }) =>
      answer(async () => {
        const current = toCalendarDay(new Date())
        const day = today === undefined ? current : dueDateSchema.parse(today)
        const tasks = await listDashboardTasks(day)
        return {
          description: `Daily review for ${day}`,
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: dailyReviewText({
                  today: day,
                  isCurrentDay: day === current,
                  ...tasks,
                }),
              },
            },
          ],
        }
      }),
  )
}

/**
 * An McpServer with every server tool (F36), the project and task resources,
 * and the daily_review prompt (F37). The tools that need approval,
 * archive_project, delete_task, delete_subtask and delete_comment, take
 * confirm: true on this transport only; without it they are refused with
 * confirmation_required and change nothing. confirm is dropped before the
 * call, so the definition's strict input schema still parses the rest. The
 * route builds a new server for every request.
 */
export function createMcpServer() {
  const server = new McpServer({ name: 'todoOverKill', version: '1.0.0' })
  for (const tool of serverTools as Array<ServedTool>) {
    const annotations = annotationsFor(tool)
    if (tool.needsApproval !== true) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations,
        },
        (args) => callTool(tool, args),
      )
      continue
    }
    const { inputSchema, description } = withConfirm(tool)
    server.registerTool(
      tool.name,
      {
        description,
        inputSchema,
        outputSchema: tool.outputSchema,
        annotations,
      },
      ({ confirm, ...args }) =>
        confirm === true
          ? callTool(tool, args)
          : Promise.resolve(confirmationRequired(tool)),
    )
  }
  registerResources(server)
  registerPrompts(server)
  return server
}

/**
 * MCP lets a client leave out the arguments of a tools/call or a prompts/get,
 * but the SDK checks them against the schema as they are, and undefined
 * fails. Missing arguments are read as {}, so list_projects and daily_review
 * run with none, and a tool with a required argument still names the one
 * that is missing.
 */
function withArguments<T extends JSONRPCMessage>(message: T): T {
  if (
    'method' in message &&
    (message.method === 'tools/call' || message.method === 'prompts/get') &&
    message.params &&
    message.params.arguments === undefined
  ) {
    return { ...message, params: { ...message.params, arguments: {} } }
  }
  return message
}

/**
 * Builds a server, connects it to the transport, and fills in missing tool and
 * prompt arguments on every message the transport delivers. Returns the
 * server so the caller can close it.
 */
export async function connectMcpServer(transport: Transport) {
  const server = createMcpServer()
  await server.connect(transport)
  const deliver = transport.onmessage
  transport.onmessage = (message, extra) =>
    deliver?.(withArguments(message), extra)
  return server
}
