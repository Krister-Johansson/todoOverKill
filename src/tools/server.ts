import type * as z from 'zod'

import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
} from '#/server/projects'
import { search } from '#/server/search'
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  moveTask,
  updateTask,
} from '#/server/tasks'
import {
  archiveProjectDefinition,
  completeTaskDefinition,
  createProjectDefinition,
  createTaskDefinition,
  deleteTaskDefinition,
  getProjectDefinition,
  getTaskDefinition,
  listProjectsDefinition,
  listTasksDefinition,
  moveTaskDefinition,
  searchDefinition,
  updateTaskDefinition,
} from '#/tools/definitions'
import { toToolError } from '#/tools/errors'

/**
 * What a service may return for an output schema's JSON: the same shape, with
 * a Date wherever the schema has a string, since JSON turns it into one.
 */
type BeforeJson<T> = T extends string
  ? T | Date
  : T extends ReadonlyArray<infer TItem>
    ? ReadonlyArray<BeforeJson<TItem>>
    : T extends object
      ? { [K in keyof T]: BeforeJson<T[K]> }
      : T

/**
 * The execute function for a definition. It parses the arguments with the
 * definition's input schema, as the chat engine does before it calls a tool,
 * so a direct call gets the same defaults and trimming. The result goes
 * through JSON, so Dates become the ISO strings the output schema expects,
 * and any error becomes a ToolError. `call`'s return type is checked against
 * the output schema, so a service whose shape drifts fails typecheck.
 */
function serve<TInput extends z.ZodType, TOutput extends z.ZodType>(
  definition: { inputSchema: TInput; outputSchema: TOutput },
  call: (input: z.output<TInput>) => Promise<BeforeJson<z.input<TOutput>>>,
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

export const createProjectTool = createProjectDefinition.server(
  serve(createProjectDefinition, (input) => createProject(input)),
)

export const archiveProjectTool = archiveProjectDefinition.server(
  serve(archiveProjectDefinition, ({ projectId }) => archiveProject(projectId)),
)

export const createTaskTool = createTaskDefinition.server(
  serve(createTaskDefinition, ({ projectId, ...input }) =>
    createTask(projectId, input),
  ),
)

export const updateTaskTool = updateTaskDefinition.server(
  serve(updateTaskDefinition, ({ taskId, ...patch }) =>
    updateTask(taskId, patch),
  ),
)

export const moveTaskTool = moveTaskDefinition.server(
  serve(moveTaskDefinition, ({ taskId, ...move }) => moveTask(taskId, move)),
)

export const completeTaskTool = completeTaskDefinition.server(
  serve(completeTaskDefinition, ({ taskId }) => completeTask(taskId)),
)

export const deleteTaskTool = deleteTaskDefinition.server(
  serve(deleteTaskDefinition, ({ taskId }) => deleteTask(taskId)),
)

/** Every server tool, for chat() in the assistant (F39) and the MCP server (F35). */
export const serverTools = [
  listProjectsTool,
  getProjectTool,
  listTasksTool,
  getTaskTool,
  searchTool,
  createProjectTool,
  archiveProjectTool,
  createTaskTool,
  updateTaskTool,
  moveTaskTool,
  completeTaskTool,
  deleteTaskTool,
]
