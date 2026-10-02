import { toolDefinition } from '@tanstack/ai'
import * as z from 'zod'

import {
  createProjectSchema,
  listProjectsSchema,
  projectIdToolSchema,
  projectOutputSchema,
  projectWithStatusesOutputSchema,
} from '#/schemas/project'
import { searchResultsOutputSchema, searchSchema } from '#/schemas/search'
import {
  createTaskToolSchema,
  listTasksToolSchema,
  moveTaskToolSchema,
  taskIdToolSchema,
  taskOutputSchema,
  updateTaskToolSchema,
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
  inputSchema: projectIdToolSchema,
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
  inputSchema: taskIdToolSchema,
  outputSchema: taskOutputSchema,
})

export const searchDefinition = toolDefinition({
  name: 'search',
  description:
    'Searches unarchived projects by name or key and their tasks by title, description or exact reference (such as TOK-42), ignoring case. Returns up to limit (1 to 50, default 10) projects and up to limit tasks. Within each, the task whose reference matches exactly and the names or titles that start with the query come first, then the other matches; each group is ordered most recently updated first. Use it when you know a name, some words or a reference but not an id.',
  inputSchema: searchSchema,
  outputSchema: searchResultsOutputSchema,
})

export const createProjectDefinition = toolDefinition({
  name: 'create_project',
  description:
    "Creates a project and returns it with its default statuses (Backlog, Todo, In progress, Done) in board order. name is required (1 to 100 characters). key is required: 2 to 10 letters or digits starting with a letter, upper-cased, and no other project may use it; it prefixes the project's task references, such as TOK-42. description (up to 2000 characters) and color (a hex value such as #1d4ed8) are optional. Use list_projects with includeArchived true first if the project may already exist, since an archived project's key is still taken.",
  inputSchema: createProjectSchema.strict(),
  outputSchema: projectWithStatusesOutputSchema,
})

export const archiveProjectDefinition = toolDefinition({
  name: 'archive_project',
  description:
    'Archives a project and returns it with its statuses; archivedAt is set. An archived project and its tasks stay in the database but are left out of list_projects and search. Archiving an archived project changes nothing. Needs the user to approve it.',
  inputSchema: projectIdToolSchema,
  outputSchema: projectWithStatusesOutputSchema,
  needsApproval: true,
})

// No tool lists a project's labels until F68 adds list_labels, so create_task
// and update_task send the model to the labels on existing tasks; F68 points
// them at list_labels instead.
export const createTaskDefinition = toolDefinition({
  name: 'create_task',
  description:
    "Creates a task in a project and returns it with its status and labels. title is required (1 to 200 characters). statusId (a status from get_project) defaults to the project's first status, and the task goes to the end of it; a task created in a done-category status starts completed, with completedAt set. priority (none, low, medium, high or urgent) defaults to none. description (up to 10000 characters), dueDate (YYYY-MM-DD) and labelIds (ids of the project's labels) are optional. Label ids come from the labels on the project's tasks in list_tasks or get_task.",
  inputSchema: createTaskToolSchema,
  outputSchema: taskOutputSchema,
})

export const updateTaskDefinition = toolDefinition({
  name: 'update_task',
  description:
    "Changes a task's title, description, priority, due date (YYYY-MM-DD) or labels and returns the task. Every field is optional and only the ones given change. null clears the description or the due date. labelIds replaces the whole label set with the project's labels given, and [] removes every label; label ids come from the labels on the project's tasks in list_tasks or get_task. Use move_task to change the status or the place on the board, and complete_task to complete it.",
  inputSchema: updateTaskToolSchema,
  outputSchema: taskOutputSchema,
})

export const moveTaskDefinition = toolDefinition({
  name: 'move_task',
  description:
    "Moves a task to another status, another place in its status, or both, and returns the task. Give statusId (a status of the task's project, from get_project), index, or both. index is the task's place counting from 0 among the other tasks in the destination status; without it the task goes to the end of a new status or keeps its place in its own. Moving into a done-category status sets completedAt, and moving to another status outside that category clears it.",
  inputSchema: moveTaskToolSchema,
  outputSchema: taskOutputSchema,
})

export const completeTaskDefinition = toolDefinition({
  name: 'complete_task',
  description:
    "Completes a task and returns it: completedAt is set and, unless it is already in a done-category status, the task moves to the end of the project's first one (Done by default). If the project has no done-category status, the task keeps its status and only completedAt is set. Completing a completed task changes nothing.",
  inputSchema: taskIdToolSchema,
  outputSchema: taskOutputSchema,
})

export const deleteTaskDefinition = toolDefinition({
  name: 'delete_task',
  description:
    'Deletes a task with its subtasks, labels and comments, and returns the task as it was. It cannot be undone; to keep the task, use complete_task instead. Needs the user to approve it.',
  inputSchema: taskIdToolSchema,
  outputSchema: taskOutputSchema,
  needsApproval: true,
})

export const toolDefinitions = [
  listProjectsDefinition,
  getProjectDefinition,
  listTasksDefinition,
  getTaskDefinition,
  searchDefinition,
  createProjectDefinition,
  archiveProjectDefinition,
  createTaskDefinition,
  updateTaskDefinition,
  moveTaskDefinition,
  completeTaskDefinition,
  deleteTaskDefinition,
]
