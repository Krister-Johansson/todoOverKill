import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createFileRoute } from '@tanstack/react-router'

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

const loopbackHostnames = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Whether the request was addressed to this machine by a loopback name. The
 * app has no auth, so a page that rebinds its own domain to 127.0.0.1 could
 * otherwise POST here and read every project. Its Host header still names
 * that domain. Any port passes, because dev, preview and the demo use
 * different ones. Without a Host header, as in Vitest, the URL's host counts.
 */
function isLoopbackHost(request: Request) {
  const host = request.headers.get('host') ?? new URL(request.url).host
  try {
    return loopbackHostnames.has(new URL(`http://${host}`).hostname)
  } catch {
    return false
  }
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
