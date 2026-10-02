import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type {
  CallToolResult,
  JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js'
import type * as z from 'zod'

import { ToolError, toToolError } from '#/tools/errors'
import { readServerTools } from '#/tools/server'

/** The part of a server tool the MCP server needs. */
type ServedTool = {
  name: string
  description: string
  inputSchema?: z.ZodObject
  outputSchema?: z.ZodObject
  execute?: (args: never) => Promise<unknown>
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
    const error = caught instanceof ToolError ? caught : toToolError(caught)
    return {
      isError: true,
      content: [{ type: 'text', text: `${error.code}: ${error.message}` }],
    }
  }
}

/**
 * An McpServer with the read tools. Only readServerTools: the write tools
 * wait for F36, which makes the ones that archive or delete ask for
 * confirm: true. Every tool is marked read only and closed world, so a client
 * can run it without asking. The route builds a new server for every request.
 */
export function createMcpServer() {
  const server = new McpServer({ name: 'todoOverKill', version: '1.0.0' })
  for (const tool of readServerTools as Array<ServedTool>) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      (args) => callTool(tool, args),
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
