import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createFileRoute } from '@tanstack/react-router'

import { createMcpServer } from '#/tools/mcp'

/**
 * GET would open a standalone event stream and DELETE would end a session.
 * The server is stateless, so it has neither, and answers as the SDK's own
 * stateless examples do.
 */
function methodNotAllowed() {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    },
    { status: 405, headers: { allow: 'POST' } },
  )
}

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      // Stateless: a new server and transport per request, no session id, so
      // nothing outlives the request. Responses are plain JSON, not a stream.
      POST: async ({ request }) => {
        const server = createMcpServer()
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        })
        await server.connect(transport)
        return transport.handleRequest(request)
      },
      GET: methodNotAllowed,
      DELETE: methodNotAllowed,
    },
  },
})
