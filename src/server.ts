// Validate the environment before anything else runs, so the built server
// fails at boot instead of on the first request that needs a variable.
import '#/env'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export default createServerEntry({
  fetch: (request) => handler.fetch(request),
})
