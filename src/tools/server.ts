import type * as z from 'zod'

import { getProject, listProjects } from '#/server/projects'
import { search } from '#/server/search'
import { getTask, listTasks } from '#/server/tasks'
import {
  getProjectDefinition,
  getTaskDefinition,
  listProjectsDefinition,
  listTasksDefinition,
  searchDefinition,
} from '#/tools/definitions'
import { toToolError } from '#/tools/errors'

/**
 * The execute function for a definition. It parses the arguments with the
 * definition's input schema, as the chat engine does before it calls a tool,
 * so a direct call gets the same defaults and trimming. The result goes
 * through JSON, so Dates become the ISO strings the output schema expects,
 * and any error becomes a ToolError.
 */
function serve<TInput extends z.ZodType, TOutput extends z.ZodType>(
  definition: { inputSchema: TInput; outputSchema: TOutput },
  call: (input: z.output<TInput>) => Promise<unknown>,
) {
  return async (args: z.input<TInput>): Promise<z.input<TOutput>> => {
    try {
      const result = await call(definition.inputSchema.parse(args))
      return JSON.parse(JSON.stringify(result))
    } catch (error) {
      throw toToolError(error)
    }
  }
}

export const listProjectsTool = listProjectsDefinition.server(
  serve(listProjectsDefinition, async (input) => ({
    projects: await listProjects(input),
  })),
)

export const getProjectTool = getProjectDefinition.server(
  serve(getProjectDefinition, ({ projectId }) => getProject(projectId)),
)

export const listTasksTool = listTasksDefinition.server(
  serve(listTasksDefinition, async ({ projectId, ...filters }) => ({
    tasks: await listTasks(projectId, filters),
  })),
)

export const getTaskTool = getTaskDefinition.server(
  serve(getTaskDefinition, ({ taskId }) => getTask(taskId)),
)

export const searchTool = searchDefinition.server(
  serve(searchDefinition, ({ query, limit }) => search(query, { limit })),
)

/** Every server tool, for chat() in the assistant (F39) and the MCP server (F35). */
export const serverTools = [
  listProjectsTool,
  getProjectTool,
  listTasksTool,
  getTaskTool,
  searchTool,
]
