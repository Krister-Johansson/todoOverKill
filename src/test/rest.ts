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
}

/** The response status and its parsed JSON body. */
export async function callRoute(
  route: RouteWithHandlers,
  method: Method,
  { url, params = {}, body }: CallOptions,
) {
  // The routes use the object form of handlers, not createHandlers.
  const handlers = route.options.server?.handlers as
    Partial<Record<Method, Handler>> | undefined
  const handler = handlers?.[method]
  if (!handler) throw new Error(`The route has no ${method} handler.`)

  const request = new Request(new URL(url, 'http://localhost'), {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: typeof body === 'string' ? body : JSON.stringify(body),
        }),
  })
  const response = await handler({ request, params, context: {} })
  return { status: response.status, json: await response.json() }
}
