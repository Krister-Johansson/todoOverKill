import type { Prisma } from '#/generated/prisma/client'
import { searchSchema } from '#/schemas/search'
import type { SearchOptions } from '#/schemas/search'
import { db } from '#/server/db'

/** Most recently updated first. The id only makes ties stable. */
const searchOrder = [
  { updatedAt: 'desc' },
  { id: 'asc' },
] as const satisfies Array<
  Prisma.ProjectOrderByWithRelationInput & Prisma.TaskOrderByWithRelationInput
>

const projectSelect = {
  id: true,
  name: true,
  key: true,
  color: true,
} as const satisfies Prisma.ProjectSelect

const taskSelect = {
  id: true,
  number: true,
  title: true,
  project: { select: { key: true, name: true } },
  status: { select: { name: true } },
} as const satisfies Prisma.TaskSelect

/** The largest value the `number` column (a PostgreSQL integer) holds. */
const MAX_TASK_NUMBER = 2_147_483_647

/**
 * Prisma's `contains` and `startsWith` with `mode: 'insensitive'` become an
 * unescaped ILIKE, so `%` and `_` would be wildcards and a trailing `\` would
 * fail the query. A backslash before each makes it plain text; the backslash
 * is PostgreSQL's default LIKE escape, so no ESCAPE clause is needed.
 */
function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * A query shaped like a task reference (`tok-12` in any case) as the key, upper
 * case as keys are stored, and the number. Anything else, or a number too big
 * for the column, is not a reference.
 */
function parseReference(query: string) {
  const match = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/.exec(query)
  if (!match) return undefined
  const number = Number(match[2])
  if (number > MAX_TASK_NUMBER) return undefined
  return { key: match[1].toUpperCase(), number }
}

/**
 * The starts-with matches first, then the other matches, each group most
 * recently updated first, up to `limit` in all. The second read leaves out
 * the whole first group with `NOT`, so a row that matches both ways comes
 * back once.
 */
async function inTwoGroups<T>(
  limit: number,
  read: (first: boolean, take: number) => Promise<Array<T>>,
) {
  const first = await read(true, limit)
  if (first.length === limit) return first
  return [...first, ...(await read(false, limit - first.length))]
}

function searchProjects(query: string, limit: number) {
  const text = escapeLike(query)
  const startsWith: Prisma.ProjectWhereInput = {
    name: { startsWith: text, mode: 'insensitive' },
  }
  const matches: Prisma.ProjectWhereInput = {
    OR: [
      { name: { contains: text, mode: 'insensitive' } },
      { key: { contains: text, mode: 'insensitive' } },
    ],
  }
  return inTwoGroups(limit, (first, take) =>
    db.project.findMany({
      where: {
        archivedAt: null,
        AND: first ? [startsWith] : [matches, { NOT: startsWith }],
      },
      select: projectSelect,
      orderBy: searchOrder,
      take,
    }),
  )
}

function searchTasks(query: string, limit: number) {
  const text = escapeLike(query)
  const reference = parseReference(query)
  const referenceMatch: Array<Prisma.TaskWhereInput> = reference
    ? [{ number: reference.number, project: { is: { key: reference.key } } }]
    : []
  const startsWith: Prisma.TaskWhereInput = {
    OR: [
      { title: { startsWith: text, mode: 'insensitive' } },
      ...referenceMatch,
    ],
  }
  const matches: Prisma.TaskWhereInput = {
    OR: [
      { title: { contains: text, mode: 'insensitive' } },
      { description: { contains: text, mode: 'insensitive' } },
      ...referenceMatch,
    ],
  }
  return inTwoGroups(limit, (first, take) =>
    db.task.findMany({
      where: {
        project: { is: { archivedAt: null } },
        AND: first ? [startsWith] : [matches, { NOT: startsWith }],
      },
      select: taskSelect,
      orderBy: searchOrder,
      take,
    }),
  )
}

/**
 * Unarchived projects by name or key, and their tasks by title,
 * description or exact reference, ignoring case, up to `limit` (default 10)
 * of each kind. `%`, `_` and `\` in the query are plain text. A query shaped
 * like `KEY-N` also finds that one task; no other query matches on reference.
 * Completed tasks are included. Within each kind, names or titles that start
 * with the query come first (and the referenced task), then the rest, each
 * most recently updated first. Throws a ZodError for a query that is blank or
 * over 200 characters after trimming, or a limit outside 1 to 50.
 */
export async function search(query: string, options: SearchOptions = {}) {
  const input = searchSchema.parse({ query, ...options })
  const [projects, tasks] = await Promise.all([
    searchProjects(input.query, input.limit),
    searchTasks(input.query, input.limit),
  ])
  return { projects, tasks }
}

export type SearchResults = Awaited<ReturnType<typeof search>>
export type SearchProject = SearchResults['projects'][number]
export type SearchTask = SearchResults['tasks'][number]
