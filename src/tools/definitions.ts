import { toolDefinition } from '@tanstack/ai'
import * as z from 'zod'

import {
  listProjectsSchema,
  projectIdSchema,
  projectOutputSchema,
  projectWithStatusesOutputSchema,
} from '#/schemas/project'
import { searchResultsOutputSchema, searchSchema } from '#/schemas/search'
import {
  listTasksToolSchema,
  taskIdSchema,
  taskOutputSchema,
} from '#/schemas/task'

// One definition per tool, shared by the assistant (F39), MCP (F35) and
// WebMCP. Input schemas are strict, so a misnamed filter is a validation
// error rather than a filter silently dropped. Every transport turns them into
// JSON Schema; they have no transforms, so both z.toJSONSchema modes work.
// Output schemas are objects, because MCP structured output must be one.

export const listProjectsDefinition = toolDefinition({
  name: 'list_projects',
  description:
    'Lists projects sorted by name as { projects }, each with its id, name, key (the prefix of task references such as TOK-42), description, colour and archivedAt. Archived projects are left out unless includeArchived is true. Use it to find a project id before calling get_project or list_tasks.',
  inputSchema: listProjectsSchema.strict(),
  outputSchema: z.object({ projects: z.array(projectOutputSchema) }),
})

export const getProjectDefinition = toolDefinition({
  name: 'get_project',
  description:
    "Gets one project with its statuses (the board's columns) in board order. Each status has an id, a name and a category: todo, in_progress or done. Use it to learn the status ids that list_tasks filters on.",
  inputSchema: z.strictObject({
    projectId: projectIdSchema.meta({
      description: 'The id of the project, from list_projects or search.',
    }),
  }),
  outputSchema: projectWithStatusesOutputSchema,
})

export const listTasksDefinition = toolDefinition({
  name: 'list_tasks',
  description:
    "Lists a project's tasks in board order as { tasks }, each with its status and labels. Every filter is optional and the ones given must all match: statusId (a status from get_project), priority (none, low, medium, high or urgent), labelId, dueFrom and dueTo (YYYY-MM-DD, both ends included; tasks with no due date are left out), completed (false for open tasks only, true for completed ones only) and q (text in the title or description, ignoring case). Use search instead to find tasks across projects or by reference.",
  inputSchema: listTasksToolSchema,
  outputSchema: z.object({ tasks: z.array(taskOutputSchema) }),
})

export const getTaskDefinition = toolDefinition({
  name: 'get_task',
  description:
    'Gets one task with its title, description, priority, due date (YYYY-MM-DD), completedAt, status and labels. The task number with the project key makes its reference, such as TOK-42. Use it to read a task whose id you have from list_tasks or search.',
  inputSchema: z.strictObject({
    taskId: taskIdSchema.meta({
      description: 'The id of the task, from list_tasks or search.',
    }),
  }),
  outputSchema: taskOutputSchema,
})

export const searchDefinition = toolDefinition({
  name: 'search',
  description:
    'Searches unarchived projects by name or key and their tasks by title, description or exact reference (such as TOK-42), ignoring case. Returns up to limit (1 to 50, default 10) projects and up to limit tasks. Within each, the task whose reference matches exactly and the names or titles that start with the query come first, then the other matches; each group is ordered most recently updated first. Use it when you know a name, some words or a reference but not an id.',
  inputSchema: searchSchema,
  outputSchema: searchResultsOutputSchema,
})

export const toolDefinitions = [
  listProjectsDefinition,
  getProjectDefinition,
  listTasksDefinition,
  getTaskDefinition,
  searchDefinition,
]
