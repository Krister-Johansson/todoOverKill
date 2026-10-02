// Calls a REST route's handler directly. Vitest cannot boot Start's fetch
// handler, which needs the Vite plugin's virtual modules, so tests build the
// Request themselves. tests/e2e/api.spec.ts covers the routing.

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

type HandlerCtx = {
  request: Request
  params: Record<string, string>
  context: object
}

type Handler = (ctx: HandlerCtx) => Response | Promise<Response>

type RouteWithHandlers = {
  options: { server?: { handlers?: unknown } }
}

type CallOptions = {
  /** Path and query, such as /api/v1/projects?includeArchived=true. */
  url: string
  params?: Record<string, string>
  /** Sent as JSON. A string is sent as is, for malformed-body tests. */
  body?: unknown
  /** The body's Content-Type. Defaults to application/json. */
  contentType?: string
}

/**
 * A fetch that sends every request to the route's handler for its method,
 * whatever the URL, such as the MCP SDK client's fetch option.
 */
export function fetchRoute(
  route: RouteWithHandlers,
  params: Record<string, string> = {},
) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    // The routes use the object form of handlers, not createHandlers.
    const handlers = route.options.server?.handlers as
      Partial<Record<string, Handler>> | undefined
    const handler = handlers?.[request.method]
    if (!handler) {
      throw new Error(`The route has no ${request.method} handler.`)
    }
    return handler({ request, params, context: {} })
  }
}

/** The response status and its parsed JSON body. */
export async function callRoute(
  route: RouteWithHandlers,
  method: Method,
  { url, params = {}, body, contentType = 'application/json' }: CallOptions,
) {
  const response = await fetchRoute(route, params)(
    new URL(url, 'http://localhost'),
    {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': contentType },
            body: typeof body === 'string' ? body : JSON.stringify(body),
          }),
    },
  )
  return { status: response.status, json: await response.json() }
}
