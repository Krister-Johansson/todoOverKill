import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type {
  CallToolResult,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'

import { ToolError, toToolError } from '#/tools/errors'
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
    return errorResult(
      caught instanceof ToolError ? caught : toToolError(caught),
    )
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
 * An McpServer with every server tool (F36). The tools that need approval,
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
  return server
}

/**
 * MCP lets a client leave out a tools/call's arguments, but the SDK checks
 * them against the strict input schema as they are, and undefined fails.
 * Missing arguments are read as {}, so list_projects runs with none, and a
 * tool with a required argument still names the one that is missing.
 */
function withArguments<T extends JSONRPCMessage>(message: T): T {
  if (
    'method' in message &&
    message.method === 'tools/call' &&
    message.params &&
    message.params.arguments === undefined
  ) {
    return { ...message, params: { ...message.params, arguments: {} } }
  }
  return message
}

/**
 * Builds a server, connects it to the transport, and fills in missing tool
 * arguments on every message the transport delivers. Returns the server so
 * the caller can close it.
 */
export async function connectMcpServer(transport: Transport) {
  const server = createMcpServer()
  await server.connect(transport)
  const deliver = transport.onmessage
  transport.onmessage = (message, extra) =>
    deliver?.(withArguments(message), extra)
  return server
}
