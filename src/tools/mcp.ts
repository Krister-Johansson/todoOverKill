import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type * as z from 'zod'

import { ToolError } from '#/tools/errors'
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
 * SDK checks against the output schema. A ToolError becomes an isError result
 * with its code and message, so the model reads what to fix.
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
  } catch (error) {
    if (!(error instanceof ToolError)) throw error
    return {
      isError: true,
      content: [{ type: 'text', text: `${error.code}: ${error.message}` }],
    }
  }
}

/**
 * An McpServer with the read tools. Only readServerTools: the write tools
 * wait for F36, which makes the ones that archive or delete ask for
 * confirm: true. The route builds a new server for every request.
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
      },
      (args) => callTool(tool, args),
    )
  }
  return server
}
