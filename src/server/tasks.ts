import type { Prisma } from '#/generated/prisma/client'
import { projectIdSchema } from '#/schemas/project'
import {
  createTaskSchema,
  listTasksSchema,
  moveTaskSchema,
  taskIdSchema,
  updateTaskSchema,
} from '#/schemas/task'
import type {
  CreateTaskInput,
  ListTasksInput,
  MoveTaskInput,
  UpdateTaskInput,
} from '#/schemas/task'
import { ACTIVITY_TYPES } from '#/server/activity'
import { db } from '#/server/db'
import { ConflictError, NotFoundError, isPrismaError } from '#/server/errors'

/** The status, for its name and category, and the labels sorted by name. */
const withRelations = {
  status: true,
  labels: { select: { label: true }, orderBy: { label: { name: 'asc' } } },
} as const satisfies Prisma.TaskInclude

type TaskRow = Prisma.TaskGetPayload<{ include: typeof withRelations }>

/**
 * Replaces the TaskLabel join rows with the labels themselves, and the due
 * date with the `YYYY-MM-DD` string the schemas take.
 */
function flatten(task: TaskRow) {
  return {
    ...task,
    dueDate: fromCalendarDate(task.dueDate),
    labels: task.labels.map(({ label }) => label),
  }
}

function projectNotFound(id: string) {
  return new NotFoundError(`No project with id ${id}.`)
}

function taskNotFound(id: string) {
  return new NotFoundError(`No task with id ${id}.`)
}

function statusNotFound(id: string) {
  return new NotFoundError(`No status with id ${id} in this project.`)
}

function labelNotFound(id: string) {
  return new NotFoundError(`No label with id ${id} in this project.`)
}

/**
 * The first of `labelIds` that is not a label of the project, or undefined
 * when they all are. Without a project it looks only for labels that exist.
 */
async function missingLabel(
  client: Prisma.TransactionClient,
  labelIds: Array<string>,
  projectId?: string,
) {
  if (labelIds.length === 0) return undefined
  const found = await client.label.findMany({
    where: { id: { in: labelIds }, projectId },
    select: { id: true },
  })
  const ids = new Set(found.map((label) => label.id))
  return labelIds.find((labelId) => !ids.has(labelId))
}

/**
 * A label deleted between the check and the TaskLabel write trips the
 * foreign key (P2003). Returns that label's NotFoundError, or `error`
 * unchanged when it is anything else.
 */
async function orDeletedLabel(
  error: unknown,
  labelIds: Array<string> | undefined,
) {
  if (!labelIds || !isPrismaError(error, 'P2003')) return error
  const missing = await missingLabel(db, labelIds)
  return missing ? labelNotFound(missing) : error
}

/**
 * Runs `work` and turns Prisma's P2025, which a write raises when the task was
 * deleted after the transaction read it, into the task's NotFoundError.
 */
async function orTaskNotFound<T>(id: string, work: () => Promise<T>) {
  try {
    return await work()
  } catch (error) {
    // The failed write aborts the transaction, so the catch sits outside it.
    if (isPrismaError(error, 'P2025')) throw taskNotFound(id)
    throw error
  }
}

/** A UTC midnight `Date`, which the `@db.Date` column stores as that calendar day. */
function toCalendarDate(day: string) {
  return new Date(`${day}T00:00:00.000Z`)
}

function fromCalendarDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null
}

/**
 * The order that puts a task at `index` among `orders`, the sorted orders of
 * the other tasks in the column: the midpoint of its two neighbours, one less
 * than the first, or one more than the last. No index means the end. Returns
 * null when the neighbours are too close for a float to fall between them.
 */
function orderAt(orders: Array<number>, index: number | undefined) {
  if (orders.length === 0) return 1
  if (index === undefined || index >= orders.length) return orders.at(-1)! + 1
  if (index === 0) return orders[0] - 1
  const before = orders[index - 1]
  const after = orders[index]
  const middle = (before + after) / 2
  return middle > before && middle < after ? middle : null
}

// Every mutation writes one activity row in the same transaction. A call that
// changes nothing, such as an empty update or completing a completed task, is
// not a mutation and writes no row.

/**
 * Creates a task with the project's next number, its labels, and a
 * `task.created` activity row, in one transaction. A task created in a
 * done-category status starts completed. Archived projects accept tasks.
 * Throws NotFoundError for an unknown project or a status or label outside it,
 * and ConflictError when the project has no statuses.
 */
export async function createTask(projectId: string, input: CreateTaskInput) {
  const id = projectIdSchema.parse(projectId)
  const { statusId, dueDate, labelIds, ...data } = createTaskSchema.parse(input)
  try {
    return await db.$transaction(
      async (tx) => {
        // The increment is one statement that row-locks the project, so
        // concurrent creates wait for each other here and each reads the value
        // the previous one committed.
        const { nextTaskNumber } = await tx.project.update({
          where: { id },
          data: { nextTaskNumber: { increment: 1 } },
          select: { nextTaskNumber: true },
        })
        const status = statusId
          ? await tx.status.findFirst({
              where: { id: statusId, projectId: id },
            })
          : await tx.status.findFirst({
              where: { projectId: id },
              orderBy: { order: 'asc' },
            })
        if (!status) {
          if (statusId) throw statusNotFound(statusId)
          throw new ConflictError(
            'The project has no statuses. Add a status first.',
          )
        }
        const missing = await missingLabel(tx, labelIds ?? [], id)
        if (missing) throw labelNotFound(missing)
        const { _max } = await tx.task.aggregate({
          where: { statusId: status.id },
          _max: { order: true },
        })
        const number = nextTaskNumber - 1
        const task = await tx.task.create({
          data: {
            ...data,
            projectId: id,
            statusId: status.id,
            number,
            dueDate: dueDate ? toCalendarDate(dueDate) : null,
            order: (_max.order ?? 0) + 1,
            completedAt: status.category === 'done' ? new Date() : null,
            labels: labelIds && {
              create: labelIds.map((labelId) => ({ labelId })),
            },
          },
          include: withRelations,
        })
        await tx.activity.create({
          data: {
            projectId: id,
            taskId: task.id,
            type: ACTIVITY_TYPES.taskCreated,
            payload: { number, title: task.title },
          },
        })
        return flatten(task)
      },
      // Concurrent creates hold a pooled connection each while they queue on
      // the project row. Prisma's defaults (2 s to start, 5 s to finish) are
      // tight for a burst that fills the pool, so allow more.
      { maxWait: 10_000, timeout: 10_000 },
    )
  } catch (error) {
    // The failed update aborts the transaction, so the catch sits outside it.
    if (isPrismaError(error, 'P2025')) throw projectNotFound(id)
    throw await orDeletedLabel(error, labelIds)
  }
}

/** A task with its status and labels. Throws NotFoundError. */
export async function getTask(id: string) {
  const taskId = taskIdSchema.parse(id)
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: withRelations,
  })
  if (!task) throw taskNotFound(taskId)
  return flatten(task)
}

/**
 * A project's tasks in board order: by status, then by order within the
 * status, with the task number breaking ties as `moveTask` does. Only the filters given apply, and all of them must match. The due
 * range includes both ends and leaves out tasks with no due date. `completed:
 * false` keeps only tasks with no `completedAt`, `true` only those with one.
 * Throws NotFoundError for an unknown project.
 */
export async function listTasks(projectId: string, input: ListTasksInput = {}) {
  const id = projectIdSchema.parse(projectId)
  const { statusId, priority, labelId, dueFrom, dueTo, completed, q } =
    listTasksSchema.parse(input)
  const project = await db.project.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!project) throw projectNotFound(id)
  const where: Prisma.TaskWhereInput = { projectId: id }
  if (statusId) where.statusId = statusId
  if (priority) where.priority = priority
  if (labelId) where.labels = { some: { labelId } }
  if (dueFrom || dueTo) {
    where.dueDate = {
      gte: dueFrom ? toCalendarDate(dueFrom) : undefined,
      lte: dueTo ? toCalendarDate(dueTo) : undefined,
    }
  }
  if (completed !== undefined) {
    where.completedAt = completed ? { not: null } : null
  }
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ]
  }
  const tasks = await db.task.findMany({
    where,
    include: withRelations,
    orderBy: [
      { status: { order: 'asc' } },
      { statusId: 'asc' },
      { order: 'asc' },
      { number: 'asc' },
    ],
  })
  return tasks.map(flatten)
}

/**
 * Changes the given fields and leaves the rest alone; `null` clears the
 * description or due date. `labelIds` is the whole new label set, in any
 * order, and only the difference is written. Writes a `task.updated` row
 * naming the fields that changed, `labels` among them. A patch that changes
 * nothing writes nothing. Throws NotFoundError for an unknown task or a label
 * outside its project.
 */
export async function updateTask(id: string, patch: UpdateTaskInput) {
  const taskId = taskIdSchema.parse(id)
  const { dueDate, labelIds, ...data } = updateTaskSchema.parse(patch)
  try {
    return await orTaskNotFound(taskId, () =>
      db.$transaction(async (tx) => {
        const task = await tx.task.findUnique({
          where: { id: taskId },
          include: withRelations,
        })
        if (!task) throw taskNotFound(taskId)
        const changes: Prisma.TaskUpdateInput = {}
        const fields: Array<string> = []
        for (const field of ['title', 'description', 'priority'] as const) {
          const value = data[field]
          if (value !== undefined && value !== task[field]) {
            Object.assign(changes, { [field]: value })
            fields.push(field)
          }
        }
        if (
          dueDate !== undefined &&
          dueDate !== fromCalendarDate(task.dueDate)
        ) {
          changes.dueDate = dueDate === null ? null : toCalendarDate(dueDate)
          fields.push('dueDate')
        }
        if (labelIds) {
          const current = new Set(task.labels.map(({ label }) => label.id))
          const wanted = new Set(labelIds)
          const added = labelIds.filter((labelId) => !current.has(labelId))
          const removed = [...current].filter((labelId) => !wanted.has(labelId))
          const missing = await missingLabel(tx, added, task.projectId)
          if (missing) throw labelNotFound(missing)
          if (added.length > 0 || removed.length > 0) {
            changes.labels = {
              deleteMany:
                removed.length > 0 ? { labelId: { in: removed } } : undefined,
              create:
                added.length > 0
                  ? added.map((labelId) => ({ labelId }))
                  : undefined,
            }
            fields.push('labels')
          }
        }
        if (fields.length === 0) return flatten(task)
        const updated = await tx.task.update({
          where: { id: taskId },
          data: changes,
          include: withRelations,
        })
        await tx.activity.create({
          data: {
            projectId: task.projectId,
            taskId,
            type: ACTIVITY_TYPES.taskUpdated,
            payload: { number: task.number, fields },
          },
        })
        return flatten(updated)
      }),
    )
  } catch (error) {
    // The failed write aborts the transaction, so the catch sits outside it.
    throw await orDeletedLabel(error, labelIds)
  }
}

/**
 * Moves the task to another status, to another place in its column, or both,
 * and writes a `task.moved` row. `index` counts the destination column's
 * other tasks, so index 0 is the top, and an index past the end appends.
 * Without an index the task goes to the end of another status, and stays where
 * it is when `statusId` is its current status. Entering a done-category status
 * sets `completedAt` (kept if already set), leaving one clears it, and a
 * reorder within one status keeps it as it is. A move that leaves the task
 * where it is writes nothing. Throws NotFoundError for an unknown task or a
 * status outside its project.
 */
export async function moveTask(id: string, input: MoveTaskInput) {
  const taskId = taskIdSchema.parse(id)
  const { statusId, index } = moveTaskSchema.parse(input)
  return orTaskNotFound(taskId, () =>
    db.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: withRelations,
      })
      if (!task) throw taskNotFound(taskId)
      const to =
        statusId === undefined || statusId === task.statusId
          ? task.status
          : await tx.status.findFirst({
              where: { id: statusId, projectId: task.projectId },
            })
      if (!to) throw statusNotFound(statusId!)
      // The moving task is left out, so in its own column `index` is the place
      // it ends up among the rest.
      let others = await tx.task.findMany({
        where: { statusId: to.id, id: { not: taskId } },
        orderBy: [{ order: 'asc' }, { number: 'asc' }],
        select: { id: true, order: true, number: true },
      })
      if (to.id === task.statusId) {
        // The task's place among the others, on the same ordering as the list.
        const current = others.filter(
          (other) =>
            other.order < task.order ||
            (other.order === task.order && other.number < task.number),
        ).length
        // Without an index the task stays where it is, so a client that sends
        // back the whole edit form with the current status does not move it.
        const target =
          index === undefined ? current : Math.min(index, others.length)
        if (target === current) return flatten(task)
      }
      let order = orderAt(
        others.map((other) => other.order),
        index,
      )
      if (order === null) {
        // Repeated moves into the same gap have used up the float precision.
        // Spread the column out to whole numbers and place the task again.
        // updateMany skips a task deleted in the meantime instead of throwing.
        for (const [position, other] of others.entries()) {
          await tx.task.updateMany({
            where: { id: other.id },
            data: { order: position + 1 },
          })
        }
        others = others.map((other, position) => ({
          ...other,
          order: position + 1,
        }))
        order = orderAt(
          others.map((other) => other.order),
          index,
        )!
      }
      const completedAt =
        to.category === 'done'
          ? (task.completedAt ?? new Date())
          : to.id === task.statusId
            ? task.completedAt
            : null
      const moved = await tx.task.update({
        where: { id: taskId },
        data: { statusId: to.id, order, completedAt },
        include: withRelations,
      })
      await tx.activity.create({
        data: {
          projectId: task.projectId,
          taskId,
          type: ACTIVITY_TYPES.taskMoved,
          payload: { number: task.number, from: task.status.name, to: to.name },
        },
      })
      return flatten(moved)
    }),
  )
}

/**
 * Sets `completedAt` and writes a `task.completed` row. A task outside a
 * done-category status moves to the end of the project's first one; a task
 * already in one stays put, and so does a task in a project with no
 * done-category status. Completing a completed task changes nothing and writes
 * no second row. Throws NotFoundError.
 */
export async function completeTask(id: string) {
  const taskId = taskIdSchema.parse(id)
  return orTaskNotFound(taskId, () =>
    db.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: withRelations,
      })
      if (!task) throw taskNotFound(taskId)
      if (task.completedAt) return flatten(task)
      const data: Prisma.TaskUncheckedUpdateManyInput = {
        completedAt: new Date(),
      }
      if (task.status.category !== 'done') {
        const done = await tx.status.findFirst({
          where: { projectId: task.projectId, category: 'done' },
          orderBy: { order: 'asc' },
        })
        if (done) {
          const { _max } = await tx.task.aggregate({
            where: { statusId: done.id },
            _max: { order: true },
          })
          data.statusId = done.id
          data.order = (_max.order ?? 0) + 1
        }
      }
      // The completedAt condition makes the check and the write one statement,
      // so two completes at once cannot both write an activity row.
      const { count } = await tx.task.updateMany({
        where: { id: taskId, completedAt: null },
        data,
      })
      const completed = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: withRelations,
      })
      if (count === 1) {
        await tx.activity.create({
          data: {
            projectId: task.projectId,
            taskId,
            type: ACTIVITY_TYPES.taskCompleted,
            payload: { number: task.number },
          },
        })
      }
      return flatten(completed)
    }),
  )
}

/**
 * Deletes the task with its subtasks, labels, and comments, and writes a
 * `task.deleted` row. The task's activity rows, that one included, stay in the
 * project history with `taskId` set to null. Returns the deleted task. Throws
 * NotFoundError.
 */
export async function deleteTask(id: string) {
  const taskId = taskIdSchema.parse(id)
  return db.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      include: withRelations,
    })
    if (!task) throw taskNotFound(taskId)
    await tx.activity.create({
      data: {
        projectId: task.projectId,
        taskId,
        type: ACTIVITY_TYPES.taskDeleted,
        payload: { number: task.number, title: task.title },
      },
    })
    await tx.task.delete({ where: { id: taskId } })
    return flatten(task)
  })
}
