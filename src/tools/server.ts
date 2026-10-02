import type * as z from 'zod'

import {
  addComment,
  deleteComment,
  listComments,
  updateComment,
} from '#/server/comments'
import { createLabel, listLabels } from '#/server/labels'
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
} from '#/server/projects'
import { search } from '#/server/search'
import {
  addSubtask,
  deleteSubtask,
  listSubtasks,
  moveSubtask,
  updateSubtask,
} from '#/server/subtasks'
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
  addCommentDefinition,
  addSubtaskDefinition,
  archiveProjectDefinition,
  completeTaskDefinition,
  createLabelDefinition,
  createProjectDefinition,
  createTaskDefinition,
  deleteCommentDefinition,
  deleteSubtaskDefinition,
  deleteTaskDefinition,
  getProjectDefinition,
  getTaskDefinition,
  listCommentsDefinition,
  listLabelsDefinition,
  listProjectsDefinition,
  listSubtasksDefinition,
  listTasksDefinition,
  moveSubtaskDefinition,
  moveTaskDefinition,
  searchDefinition,
  updateCommentDefinition,
  updateSubtaskDefinition,
  updateTaskDefinition,
} from '#/tools/definitions'
import { toToolError } from '#/tools/errors'

/**
 * What a service may return for an output schema's JSON: the same shape, with
 * a Date allowed wherever the schema has a string, since JSON turns it into
 * one. It checks field names, nullability and nesting, not string formats: a
 * due date returned as a Date passes typecheck and then fails the output
 * schema at runtime, because JSON makes it a timestamp rather than YYYY-MM-DD.
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
 * the output schema with BeforeJson, so a service whose fields drift fails
 * typecheck; string formats are left to the output schema.
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

export const listSubtasksTool = listSubtasksDefinition.server(
  serve(listSubtasksDefinition, async ({ taskId }) => ({
    subtasks: await listSubtasks(taskId),
  })),
)

export const addSubtaskTool = addSubtaskDefinition.server(
  serve(addSubtaskDefinition, ({ taskId, ...input }) =>
    addSubtask(taskId, input),
  ),
)

export const updateSubtaskTool = updateSubtaskDefinition.server(
  serve(updateSubtaskDefinition, ({ subtaskId, ...patch }) =>
    updateSubtask(subtaskId, patch),
  ),
)

export const moveSubtaskTool = moveSubtaskDefinition.server(
  serve(moveSubtaskDefinition, ({ subtaskId, ...move }) =>
    moveSubtask(subtaskId, move),
  ),
)

export const deleteSubtaskTool = deleteSubtaskDefinition.server(
  serve(deleteSubtaskDefinition, ({ subtaskId }) => deleteSubtask(subtaskId)),
)

export const listLabelsTool = listLabelsDefinition.server(
  serve(listLabelsDefinition, async ({ projectId }) => ({
    labels: await listLabels(projectId),
  })),
)

export const createLabelTool = createLabelDefinition.server(
  serve(createLabelDefinition, ({ projectId, ...input }) =>
    createLabel(projectId, input),
  ),
)

export const listCommentsTool = listCommentsDefinition.server(
  serve(listCommentsDefinition, async ({ taskId }) => ({
    comments: await listComments(taskId),
  })),
)

export const addCommentTool = addCommentDefinition.server(
  serve(addCommentDefinition, ({ taskId, ...input }) =>
    addComment(taskId, input),
  ),
)

export const updateCommentTool = updateCommentDefinition.server(
  serve(updateCommentDefinition, ({ commentId, ...input }) =>
    updateComment(commentId, input),
  ),
)

export const deleteCommentTool = deleteCommentDefinition.server(
  serve(deleteCommentDefinition, ({ commentId }) => deleteComment(commentId)),
)

/**
 * The tools that only read. The MCP server marks these readOnlyHint true and
 * every other tool readOnlyHint false.
 */
export const readServerTools = [
  listProjectsTool,
  getProjectTool,
  listTasksTool,
  getTaskTool,
  searchTool,
  listSubtasksTool,
  listLabelsTool,
  listCommentsTool,
]

/**
 * Every server tool in toolDefinitions order, for the MCP server (F36) and
 * chat() in the assistant (F39).
 */
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
  listSubtasksTool,
  addSubtaskTool,
  updateSubtaskTool,
  moveSubtaskTool,
  deleteSubtaskTool,
  listLabelsTool,
  createLabelTool,
  listCommentsTool,
  addCommentTool,
  updateCommentTool,
  deleteCommentTool,
]
