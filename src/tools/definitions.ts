import { toolDefinition } from '@tanstack/ai'
import * as z from 'zod'

import { PROJECT_COLORS } from '#/lib/project-colors'
import {
  addCommentToolSchema,
  commentIdToolSchema,
  commentOutputSchema,
  updateCommentToolSchema,
} from '#/schemas/comment'
import { createLabelToolSchema, labelOutputSchema } from '#/schemas/label'
import {
  createProjectSchema,
  listProjectsSchema,
  projectIdToolSchema,
  projectOutputSchema,
  projectWithStatusesOutputSchema,
} from '#/schemas/project'
import { searchResultsOutputSchema, searchSchema } from '#/schemas/search'
import {
  addSubtaskToolSchema,
  moveSubtaskToolSchema,
  subtaskIdToolSchema,
  subtaskOutputSchema,
  updateSubtaskToolSchema,
} from '#/schemas/subtask'
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
    "Lists a project's tasks in board order as { tasks }, each with its status and labels. Every filter is optional and the ones given must all match: statusId (a status from get_project), priority (none, low, medium, high or urgent), labelId (a label from list_labels), dueFrom and dueTo (YYYY-MM-DD, both ends included; tasks with no due date are left out), completed (false for open tasks only, true for completed ones only) and q (text in the title or description, ignoring case). Use search instead to find tasks across projects or by reference.",
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
    'Searches unarchived projects by name or key and their tasks by title, description or exact reference (such as TOK-42), ignoring case. Returns up to limit (1 to 50, default 10) projects and up to limit tasks. Within each, the project whose key is the query, the task whose reference matches exactly and the names or titles that start with the query come first, then the other matches; each group is ordered most recently updated first. Use it when you know a name, some words or a reference but not an id.',
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

export const createTaskDefinition = toolDefinition({
  name: 'create_task',
  description:
    "Creates a task in a project and returns it with its status and labels. title is required (1 to 200 characters). statusId (a status from get_project) defaults to the project's first status, and the task goes to the end of it; a task created in a done-category status starts completed, with completedAt set. priority (none, low, medium, high or urgent) defaults to none. description (up to 10000 characters), dueDate (YYYY-MM-DD) and labelIds (ids of the project's labels, from list_labels) are optional.",
  inputSchema: createTaskToolSchema,
  outputSchema: taskOutputSchema,
})

export const updateTaskDefinition = toolDefinition({
  name: 'update_task',
  description:
    "Changes a task's title, description, priority, due date (YYYY-MM-DD) or labels and returns the task. Every field is optional and only the ones given change. null clears the description or the due date. labelIds replaces the whole label set with the project's labels given, and [] removes every label; label ids come from list_labels. Use move_task to change the status or the place on the board, and complete_task to complete it.",
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

export const listSubtasksDefinition = toolDefinition({
  name: 'list_subtasks',
  description:
    "Lists a task's subtasks top to bottom as { subtasks }, each with its id, title, done (true when ticked off) and order. Use it to find a subtask id before calling update_subtask, move_subtask or delete_subtask.",
  inputSchema: taskIdToolSchema,
  outputSchema: z.object({ subtasks: z.array(subtaskOutputSchema) }),
})

export const addSubtaskDefinition = toolDefinition({
  name: 'add_subtask',
  description:
    "Adds a subtask to the end of a task's list, not done, and returns it. title is required (1 to 200 characters). Use move_subtask afterwards to put it somewhere else.",
  inputSchema: addSubtaskToolSchema,
  outputSchema: subtaskOutputSchema,
})

export const updateSubtaskDefinition = toolDefinition({
  name: 'update_subtask',
  description:
    "Changes a subtask's title (1 to 200 characters), its done state, or both, and returns the subtask. Both fields are optional and only the ones given change; done true ticks it off and false opens it again. Use move_subtask to change its place.",
  inputSchema: updateSubtaskToolSchema,
  outputSchema: subtaskOutputSchema,
})

export const moveSubtaskDefinition = toolDefinition({
  name: 'move_subtask',
  description:
    "Moves a subtask to another place in its task's list and returns it. index is the subtask's new position in the list from list_subtasks, counting from 0, so 0 is the top. It is not the order value that list_subtasks and this tool return. An index past the end means the end.",
  inputSchema: moveSubtaskToolSchema,
  outputSchema: subtaskOutputSchema,
})

export const deleteSubtaskDefinition = toolDefinition({
  name: 'delete_subtask',
  description:
    'Deletes a subtask and returns it as it was. It cannot be undone; to keep it, use update_subtask with done true instead. Needs the user to approve it.',
  inputSchema: subtaskIdToolSchema,
  outputSchema: subtaskOutputSchema,
  needsApproval: true,
})

export const listLabelsDefinition = toolDefinition({
  name: 'list_labels',
  description:
    "Lists a project's labels sorted by name as { labels }, each with its id, name and colour. Use it to find the label ids that create_task and update_task take and that list_tasks filters on.",
  inputSchema: projectIdToolSchema,
  outputSchema: z.object({ labels: z.array(labelOutputSchema) }),
})

export const createLabelDefinition = toolDefinition({
  name: 'create_label',
  description: `Creates a label in a project and returns it. name is required (1 to 50 characters), and no other label in the project may have the same name in any case, so call list_labels first. color is required and must be one of the project colours: ${PROJECT_COLORS.map((color) => `${color.value} (${color.name})`).join(', ')}. Attach the label to a task with create_task or update_task.`,
  inputSchema: createLabelToolSchema,
  outputSchema: labelOutputSchema,
})

export const listCommentsDefinition = toolDefinition({
  name: 'list_comments',
  description:
    "Lists a task's comments oldest first as { comments }, each with its id, body, createdAt and updatedAt. Use it to read the discussion on a task or to find a comment id before calling update_comment or delete_comment.",
  inputSchema: taskIdToolSchema,
  outputSchema: z.object({ comments: z.array(commentOutputSchema) }),
})

export const addCommentDefinition = toolDefinition({
  name: 'add_comment',
  description:
    'Adds a comment to a task and returns it. body is required (1 to 10000 characters).',
  inputSchema: addCommentToolSchema,
  outputSchema: commentOutputSchema,
})

export const updateCommentDefinition = toolDefinition({
  name: 'update_comment',
  description:
    "Replaces a comment's body (1 to 10000 characters) and returns the comment. Sending the current body changes nothing.",
  inputSchema: updateCommentToolSchema,
  outputSchema: commentOutputSchema,
})

export const deleteCommentDefinition = toolDefinition({
  name: 'delete_comment',
  description:
    'Deletes a comment and returns it as it was. It cannot be undone. Needs the user to approve it.',
  inputSchema: commentIdToolSchema,
  outputSchema: commentOutputSchema,
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
  listSubtasksDefinition,
  addSubtaskDefinition,
  updateSubtaskDefinition,
  moveSubtaskDefinition,
  deleteSubtaskDefinition,
  listLabelsDefinition,
  createLabelDefinition,
  listCommentsDefinition,
  addCommentDefinition,
  updateCommentDefinition,
  deleteCommentDefinition,
]
