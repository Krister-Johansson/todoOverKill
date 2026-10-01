import type { Prisma, PrismaClient } from '#/generated/prisma/client'
import type { Priority } from '#/generated/prisma/enums'
import { ACTIVITY_TYPES } from '#/server/activity'
import { DEFAULT_STATUSES } from '#/server/projects'

/** The projects the seed owns. Every run deletes and recreates them. */
export const SEED_PROJECT_KEYS = ['TOK', 'DEMO'] as const

type StatusName = (typeof DEFAULT_STATUSES)[number]['name']

type SeedTask = {
  title: string
  description?: string
  status: StatusName
  priority: Priority
  /** Days from `now`: negative is overdue, 0 is today, null is no due date. */
  due: number | null
  labels?: Array<string>
  subtasks?: Array<{ title: string; done: boolean }>
  comments?: Array<string>
}

type SeedProject = {
  key: (typeof SEED_PROJECT_KEYS)[number]
  name: string
  description: string
  color: string
  labels: Array<{ name: string; color: string }>
  tasks: Array<SeedTask>
}

const PROJECTS: Array<SeedProject> = [
  {
    key: 'TOK',
    name: 'todoOverKill',
    description:
      'The app itself: an accessible project tracker with a REST API, an MCP server, and a voice assistant.',
    color: '#1d4ed8',
    labels: [
      { name: 'bug', color: '#b91c1c' },
      { name: 'feature', color: '#1d4ed8' },
      { name: 'docs', color: '#4d7c0f' },
      { name: 'a11y', color: '#7e22ce' },
    ],
    tasks: [
      {
        title: 'Set up the project board',
        description:
          'Columns for **Backlog**, **Todo**, **In progress**, and **Done**.',
        status: 'Done',
        priority: 'high',
        due: -10,
        labels: ['feature'],
        subtasks: [
          { title: 'Render columns', done: true },
          { title: 'Show task count per column', done: true },
        ],
        comments: ['Shipped. The column headers are `h2` elements.'],
      },
      {
        title: 'Add a skip link to the shell',
        description: 'The first Tab stop jumps to `#main`.',
        status: 'Done',
        priority: 'medium',
        due: -7,
        labels: ['a11y'],
      },
      {
        title: 'Write the REST API reference',
        description:
          'Generate it from the Zod schemas and serve it at `/api-docs`.',
        status: 'Done',
        priority: 'low',
        due: null,
        labels: ['docs'],
        comments: ['The OpenAPI document validates with no warnings.'],
      },
      {
        title: 'Focus ring disappears in dark theme',
        description:
          'The outline colour matches the card background, so keyboard users lose their place.\n\n1. Switch to dark theme\n2. Tab onto a card',
        status: 'Done',
        priority: 'urgent',
        due: -3,
        labels: ['bug', 'a11y'],
        comments: [
          'Reproduced in Chrome and Firefox.',
          'Fixed by using `--ring` from the theme, which passes 3:1 on both backgrounds.',
        ],
      },
      {
        title: 'Keyboard move menu on task cards',
        description:
          'Every drag action needs a button equivalent. Add a **Move to** menu to each card.',
        status: 'In progress',
        priority: 'urgent',
        due: 0,
        labels: ['feature', 'a11y'],
        subtasks: [
          { title: 'Menu with one item per status', done: true },
          { title: 'Move up and move down items', done: false },
          { title: 'Announce the move in the live region', done: false },
        ],
        comments: [
          'Using the shadcn `DropdownMenu`, it already handles arrow keys.',
        ],
      },
      {
        title: 'Announce status changes to screen readers',
        description:
          'One polite live region in `__root.tsx`, shared by every view.',
        status: 'In progress',
        priority: 'high',
        due: 1,
        labels: ['a11y'],
        subtasks: [
          { title: 'Live region component', done: true },
          { title: 'Hook for posting messages', done: false },
        ],
      },
      {
        title: 'Voice input button',
        description:
          'Feature-detect `SpeechRecognition` and hide the button when it is missing.',
        status: 'In progress',
        priority: 'medium',
        due: 3,
        labels: ['feature'],
        comments: [
          'Chrome only for now. The button must never throw elsewhere.',
        ],
      },
      {
        title: 'Due date picker loses focus on close',
        description:
          'After choosing a date, focus goes to `body` instead of the trigger.',
        status: 'Todo',
        priority: 'high',
        due: -1,
        labels: ['bug', 'a11y'],
        comments: ['Probably the popover unmounting before focus is restored.'],
      },
      {
        title: 'List view with sortable columns',
        description: 'TanStack Table with `aria-sort` on the header buttons.',
        status: 'Todo',
        priority: 'medium',
        due: 2,
        labels: ['feature'],
        subtasks: [
          { title: 'Columns: key, title, status, priority, due', done: false },
          { title: 'Sort by any column', done: false },
        ],
      },
      {
        title: 'Filter tasks by label',
        status: 'Todo',
        priority: 'medium',
        due: 5,
        labels: ['feature'],
      },
      {
        title: 'Document the keyboard shortcuts',
        description:
          'A table on the help page, generated from the same map the hotkeys use.',
        status: 'Todo',
        priority: 'low',
        due: 6,
        labels: ['docs', 'a11y'],
      },
      {
        title: 'Check contrast of priority badges',
        description:
          'Every badge needs 7:1 against its background in both themes.',
        status: 'Todo',
        priority: 'high',
        due: 4,
        labels: ['a11y'],
        subtasks: [
          { title: 'Light theme', done: true },
          { title: 'Dark theme', done: false },
        ],
      },
      {
        title: 'MCP server endpoint',
        description:
          'Serve the domain tools over Streamable HTTP at `/api/mcp`.',
        status: 'Backlog',
        priority: 'high',
        due: 21,
        labels: ['feature'],
      },
      {
        title: 'Expose page tools through WebMCP',
        description:
          'Register tools on `document.modelContext` when it exists.',
        status: 'Backlog',
        priority: 'medium',
        due: 30,
        labels: ['feature'],
      },
      {
        title: 'Read assistant replies aloud',
        description: 'Off by default. Escape and a Stop button cancel speech.',
        status: 'Backlog',
        priority: 'low',
        due: 45,
        labels: ['feature', 'a11y'],
      },
      {
        title: 'Search across projects',
        status: 'Backlog',
        priority: 'medium',
        due: 14,
        labels: ['feature'],
        comments: [
          'PostgreSQL full-text search should be enough for a single user.',
        ],
      },
      {
        title: 'Reflow at 400% zoom',
        description:
          'No horizontal scroll on the board at 320 CSS pixels wide.',
        status: 'Backlog',
        priority: 'high',
        due: 60,
        labels: ['a11y'],
      },
      {
        title: 'Archive old projects',
        status: 'Backlog',
        priority: 'none',
        due: null,
        labels: ['feature'],
      },
      {
        title: 'Write a contributing guide',
        description: 'Branch names, commit style, and the definition of done.',
        status: 'Backlog',
        priority: 'none',
        due: null,
        labels: ['docs'],
      },
      {
        title: 'Reduced motion for board animations',
        description:
          'With `prefers-reduced-motion: reduce`, cards move without sliding.',
        status: 'Backlog',
        priority: 'low',
        due: null,
        labels: ['a11y'],
        subtasks: [{ title: 'Audit every `motion` component', done: false }],
      },
    ],
  },
  {
    key: 'DEMO',
    name: 'Product launch',
    description:
      'A sample marketing project to try the board, list, and assistant on.',
    color: '#0f766e',
    labels: [
      { name: 'design', color: '#be185d' },
      { name: 'research', color: '#0e7490' },
      { name: 'marketing', color: '#c2410c' },
      { name: 'ops', color: '#475569' },
    ],
    tasks: [
      {
        title: 'Interview five beta users',
        description: 'Ask what they track today and what slows them down.',
        status: 'Done',
        priority: 'high',
        due: -14,
        labels: ['research'],
        subtasks: [
          { title: 'Write the interview script', done: true },
          { title: 'Book the calls', done: true },
          { title: 'Summarise the notes', done: true },
        ],
        comments: [
          'Main theme: people want keyboard shortcuts for everything.',
        ],
      },
      {
        title: 'Pick the launch date',
        status: 'Done',
        priority: 'urgent',
        due: -5,
        labels: ['ops'],
      },
      {
        title: 'Landing page copy',
        description: 'Lead with accessibility, then the assistant.',
        status: 'In progress',
        priority: 'high',
        due: 2,
        labels: ['marketing'],
        comments: [
          'First draft is in the shared doc.',
          'Cut the hero paragraph to two sentences.',
        ],
      },
      {
        title: 'Screenshots for the announcement',
        status: 'In progress',
        priority: 'medium',
        due: 4,
        labels: ['design', 'marketing'],
        subtasks: [
          { title: 'Board in light theme', done: true },
          { title: 'Board in dark theme', done: false },
        ],
      },
      {
        title: 'Book the demo webinar',
        status: 'Todo',
        priority: 'medium',
        due: -2,
        labels: ['ops'],
      },
      {
        title: 'Press kit',
        description:
          'Logo files, a one-paragraph summary, and three screenshots.',
        status: 'Todo',
        priority: 'low',
        due: 10,
        labels: ['design', 'marketing'],
      },
      {
        title: 'Survey on pricing',
        status: 'Todo',
        priority: 'none',
        due: null,
        labels: ['research'],
      },
      {
        title: 'Launch day checklist',
        status: 'Backlog',
        priority: 'urgent',
        due: 18,
        labels: ['ops'],
        subtasks: [
          { title: 'Status page ready', done: false },
          { title: 'Support rota', done: false },
        ],
      },
      {
        title: 'Follow-up email sequence',
        status: 'Backlog',
        priority: 'low',
        due: 35,
        labels: ['marketing'],
      },
      {
        title: 'Competitor review',
        description: 'How do other trackers handle keyboard-only use?',
        status: 'Backlog',
        priority: 'medium',
        due: null,
        labels: ['research'],
        comments: ['Most of them have no non-drag way to move a card.'],
      },
    ],
  },
]

const DAY = 24 * 60 * 60 * 1000
const MINUTE = 60 * 1000

/** A UTC midnight `Date`, which the `@db.Date` column stores as that calendar day. */
function dayOffset(now: Date, days: number) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days),
  )
}

export type SeedClient = PrismaClient | Prisma.TransactionClient

export type SeedResult = Record<
  (typeof SEED_PROJECT_KEYS)[number],
  { tasks: number }
>

/**
 * Deletes the TOK and DEMO projects and creates them again with demo data, so
 * every run ends in the same state. Other projects are left alone.
 *
 * Pass a PrismaClient and the work runs in one transaction; pass a transaction
 * client and it runs in that one. Timestamps and due dates are relative to
 * `now`, which defaults to the current time.
 */
export async function seed(
  db: SeedClient,
  options: { now?: Date } = {},
): Promise<SeedResult> {
  const now = options.now ?? new Date()
  if ('$transaction' in db) {
    // About 45 queries in sequence. Locally that takes well under Prisma's 5 s
    // default, but a slow or cold database should not abort the seed halfway.
    return db.$transaction((tx) => seedIn(tx, now), {
      maxWait: 10_000,
      timeout: 60_000,
    })
  }
  return seedIn(db, now)
}

async function seedIn(tx: Prisma.TransactionClient, now: Date) {
  const existing = await tx.project.findMany({
    where: { key: { in: [...SEED_PROJECT_KEYS] } },
    select: { id: true },
  })
  const ids = existing.map((project) => project.id)
  // Tasks first. Deleting a project cascades to both its statuses and its
  // tasks, and the task-to-status foreign key is RESTRICT, so PostgreSQL can
  // refuse the status delete while tasks still point at it.
  await tx.task.deleteMany({ where: { projectId: { in: ids } } })
  await tx.project.deleteMany({ where: { id: { in: ids } } })

  const result = {} as SeedResult

  for (const spec of PROJECTS) {
    const createdAt = new Date(now.getTime() - 30 * DAY)
    const project = await tx.project.create({
      data: {
        key: spec.key,
        name: spec.name,
        description: spec.description,
        color: spec.color,
        nextTaskNumber: spec.tasks.length + 1,
        createdAt,
        statuses: {
          create: DEFAULT_STATUSES.map((status, index) => ({
            ...status,
            order: index + 1,
          })),
        },
        labels: { create: spec.labels },
      },
      include: { statuses: true, labels: true },
    })
    const statusId = new Map(project.statuses.map((s) => [s.name, s.id]))
    const labelId = new Map(project.labels.map((l) => [l.name, l.id]))
    const orderInStatus = new Map<string, number>()

    const subtasks: Array<Prisma.SubtaskCreateManyInput> = []
    const taskLabels: Array<Prisma.TaskLabelCreateManyInput> = []
    const comments: Array<Prisma.CommentCreateManyInput> = []
    const activity: Array<Prisma.ActivityCreateManyInput> = [
      {
        projectId: project.id,
        type: ACTIVITY_TYPES.projectCreated,
        payload: { name: spec.name, key: spec.key },
        createdAt,
      },
    ]

    for (const [index, item] of spec.tasks.entries()) {
      const number = index + 1
      const order = (orderInStatus.get(item.status) ?? 0) + 1
      orderInStatus.set(item.status, order)
      // One task a day, the last one created yesterday. Each task's own events
      // follow its creation in a fixed order, so the activity feed reads
      // forwards: subtasks, the move out of Backlog, comments, completion.
      const taskCreatedAt = new Date(
        now.getTime() - (spec.tasks.length - index) * DAY,
      )
      let minutes = 0
      const tick = () => {
        minutes += 47
        return new Date(taskCreatedAt.getTime() + minutes * MINUTE)
      }
      const done = item.status === 'Done'
      const subtaskTimes = (item.subtasks ?? []).map(tick)
      const movedAt = item.status === 'Backlog' ? null : tick()
      const commentTimes = (item.comments ?? []).map(tick)
      const completedAt = done ? tick() : null

      const task = await tx.task.create({
        data: {
          projectId: project.id,
          statusId: statusId.get(item.status)!,
          number,
          title: item.title,
          description: item.description ?? null,
          priority: item.priority,
          dueDate: item.due === null ? null : dayOffset(now, item.due),
          order,
          completedAt,
          createdAt: taskCreatedAt,
        },
        select: { id: true },
      })
      const event = (
        type: string,
        payload: Prisma.InputJsonObject,
        at: Date,
      ) => ({
        projectId: project.id,
        taskId: task.id,
        type,
        payload,
        createdAt: at,
      })

      activity.push(
        event(
          ACTIVITY_TYPES.taskCreated,
          { number, title: item.title },
          taskCreatedAt,
        ),
      )
      for (const [i, subtask] of (item.subtasks ?? []).entries()) {
        subtasks.push({ taskId: task.id, ...subtask, order: i + 1 })
        activity.push(
          event(
            ACTIVITY_TYPES.subtaskAdded,
            { title: subtask.title },
            subtaskTimes[i],
          ),
        )
      }
      if (movedAt) {
        activity.push(
          event(
            ACTIVITY_TYPES.taskMoved,
            { from: 'Backlog', to: item.status },
            movedAt,
          ),
        )
      }
      for (const [i, body] of (item.comments ?? []).entries()) {
        const at = commentTimes[i]
        comments.push({ taskId: task.id, body, createdAt: at, updatedAt: at })
        activity.push(event(ACTIVITY_TYPES.commentAdded, { body }, at))
      }
      if (completedAt) {
        activity.push(
          event(ACTIVITY_TYPES.taskCompleted, { number }, completedAt),
        )
      }
      for (const name of item.labels ?? []) {
        taskLabels.push({ taskId: task.id, labelId: labelId.get(name)! })
      }
    }

    await tx.subtask.createMany({ data: subtasks })
    await tx.taskLabel.createMany({ data: taskLabels })
    await tx.comment.createMany({ data: comments })
    await tx.activity.createMany({ data: activity })
    result[spec.key] = { tasks: spec.tasks.length }
  }

  return result
}
