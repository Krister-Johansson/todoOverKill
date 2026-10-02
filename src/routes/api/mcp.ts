import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createFileRoute } from '@tanstack/react-router'

import { isLoopbackHost } from '#/lib/loopback'
import { connectMcpServer } from '#/tools/mcp'

/** The JSON-RPC error body the SDK sends when it refuses a request. */
function jsonRpcError(status: number, message: string, headers?: HeadersInit) {
  return Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
    { status, headers },
  )
}

/**
 * GET would open a standalone event stream and DELETE would end a session.
 * The server is stateless, so it has neither, and answers as the SDK's own
 * stateless examples do.
 */
function methodNotAllowed() {
  return jsonRpcError(405, 'Method not allowed.', { allow: 'POST' })
}

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      // Stateless: a new server and transport per request, no session id, so
      // nothing outlives the request. Responses are plain JSON, not a stream,
      // so the response is complete when handleRequest resolves. Closing the
      // server then closes the transport too.
      POST: async ({ request }) => {
        if (!isLoopbackHost(request)) {
          return jsonRpcError(403, 'Only localhost may use this server.')
        }
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        })
        const server = await connectMcpServer(transport)
        try {
          return await transport.handleRequest(request)
        } finally {
          await server.close()
        }
      },
      GET: methodNotAllowed,
      DELETE: methodNotAllowed,
    },
  },
})
