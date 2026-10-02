const loopbackHostnames = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Whether the request was addressed to this machine by a loopback name. The
 * app has no auth, so a page that rebinds its own domain to 127.0.0.1 could
 * otherwise POST to /api/mcp or /api/chat and read every project or spend the
 * OpenRouter key. Its Host header still names that domain. Any port passes,
 * because dev, preview and the demo use different ones. Without a Host header,
 * as in Vitest, the URL's host counts.
 */
export function isLoopbackHost(request: Request) {
  const host = request.headers.get('host') ?? new URL(request.url).host
  try {
    return loopbackHostnames.has(new URL(`http://${host}`).hostname)
  } catch {
    return false
  }
}
