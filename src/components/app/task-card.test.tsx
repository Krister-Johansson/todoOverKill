import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LiveRegionProvider } from './live-region'
import {
  TaskCard,
  TaskCardContent,
  focusMoveButton,
  focusTaskCard,
  moveButtonId,
  taskCardId,
} from './task-card'
import { TaskMoveMenu } from './task-move-menu'

import type { MoveProject } from './task-move-menu'

// The Move menu imports the server functions; these tests never call them.
vi.mock('#/fns/tasks', () => ({
  moveTaskFn: vi.fn(),
  tasksQueryOptions: (projectId: string) => ({
    queryKey: ['projects', projectId, 'tasks'],
  }),
  taskQueryOptions: (taskId: string) => ({ queryKey: ['tasks', taskId] }),
}))
vi.mock('#/fns/projects', () => ({
  projectQueryOptions: (id: string) => ({ queryKey: ['projects', id] }),
}))

afterEach(cleanup)

const project = { name: 'Website', key: 'WEB' }

function task(
  overrides: Partial<Parameters<typeof TaskCardContent>[0]['task']> = {},
) {
  return {
    number: 7,
    title: 'Fix the footer',
    priority: 'high' as const,
    dueDate: '2026-10-01',
    completedAt: null as Date | null,
    labels: [
      { id: 'l1', name: 'Bug', color: '#dc2626' },
      { id: 'l2', name: 'Design', color: '#2563eb' },
    ],
    ...overrides,
  }
}

function renderCard(
  overrides: Parameters<typeof task>[0] = {},
  today = '2026-10-02',
) {
  return render(
    <div data-testid="card">
      <TaskCardContent task={task(overrides)} project={project} today={today} />
    </div>,
  )
}

describe('TaskCardContent', () => {
  it('shows the task reference as an abbreviation naming the project', () => {
    renderCard()
    const reference = screen.getByText('WEB-7')
    expect(reference.tagName).toBe('ABBR')
    expect(reference.getAttribute('title')).toContain('Website')
  })

  it('shows the title and the priority as text', () => {
    renderCard()
    expect(screen.getByText('Fix the footer')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
  })

  it('shows the due date and Overdue once the day has passed', () => {
    renderCard()
    const time = screen.getByText('Oct 1, 2026')
    expect(time.tagName).toBe('TIME')
    expect(time.getAttribute('datetime')).toBe('2026-10-01')
    expect(time.parentElement?.textContent).toBe('Due Oct 1, 2026')
    expect(screen.getByText('Overdue')).toBeTruthy()
  })

  it('is not overdue on the due day itself', () => {
    renderCard({}, '2026-10-01')
    expect(screen.queryByText('Overdue')).toBeNull()
  })

  it('is not overdue once completed', () => {
    renderCard({ completedAt: new Date('2026-09-30T12:00:00Z') })
    expect(screen.getByText('Oct 1, 2026')).toBeTruthy()
    expect(screen.queryByText('Overdue')).toBeNull()
  })

  it('shows no date without a due date', () => {
    renderCard({ dueDate: null })
    expect(screen.getByTestId('card').querySelector('time')).toBeNull()
    expect(screen.queryByText('Overdue')).toBeNull()
  })

  it('lists the labels', () => {
    renderCard()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    // Each chip starts with a comma that only screen readers get.
    expect(items.map((item) => item.textContent)).toEqual([', Bug', ', Design'])
  })

  it('separates the parts of the link name with commas', () => {
    renderCard()
    expect(screen.getByTestId('card').textContent).toBe(
      'WEB-7, Fix the footer, High, Due Oct 1, 2026, Overdue, Bug, Design',
    )
  })

  it('renders no list without labels', () => {
    renderCard({ labels: [] })
    expect(screen.queryByRole('list')).toBeNull()
  })
})

const boardProject = {
  ...project,
  id: 'p1',
  statuses: [
    { id: 's1', projectId: 'p1', name: 'Backlog', order: 1, category: 'todo' },
    { id: 's2', projectId: 'p1', name: 'Doing', order: 2, category: 'todo' },
  ] as const satisfies MoveProject['statuses'],
}

type BoardCardOptions = { position?: number; statusId?: string }

/**
 * Renders board cards for `task-1` (and `task-2` below it when `pair` is set)
 * inside a router, a query client and the live region. Returns a function
 * that renders them again with new props, as the board does after a move.
 */
async function renderBoardCards({
  pair = false,
  ...first
}: BoardCardOptions & { pair?: boolean } = {}) {
  let props = first
  let rerender: (next: BoardCardOptions) => void = () => {}
  function Cards() {
    const [current, setCurrent] = useState(props)
    rerender = setCurrent
    const { position = 0, statusId = 's1' } = current
    const card = (
      cardTask: ReturnType<typeof task> & { id: string },
      at: number,
    ) => (
      <TaskCard
        key={cardTask.id}
        task={{ ...cardTask, statusId }}
        project={boardProject}
        today="2026-10-02"
        position={at}
        menu={
          <TaskMoveMenu
            task={{ ...cardTask, statusId }}
            project={boardProject}
            position={at}
            count={pair ? 2 : 1}
          />
        }
      />
    )
    const one = card({ ...task(), id: 'task-1' }, position)
    const two = pair
      ? card({ ...task({ number: 8 }), id: 'task-2' }, position === 0 ? 1 : 0)
      : null
    return <ul>{position === 0 ? [one, two] : [two, one]}</ul>
  }
  const rootRoute = createRootRoute({ component: Cards })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LiveRegionProvider>
        <RouterProvider router={router} />
      </LiveRegionProvider>
    </QueryClientProvider>,
  )
  await screen.findAllByRole('link')
  return (next: BoardCardOptions) => {
    props = next
    act(() => rerender(next))
  }
}

/** Renders a board card for `task-1` and returns its link. */
async function renderBoardCard() {
  await renderBoardCards()
  return screen.getByRole('link')
}

function moveButton(name = 'Move WEB-7') {
  return screen.getByRole('button', { name })
}

/** A button that holds focus until the card renders. */
function holderButton() {
  const holder = document.createElement('button')
  holder.textContent = 'New task'
  document.body.append(holder)
  return holder
}

describe('TaskCard', () => {
  it('gives the link the id from taskCardId', async () => {
    const link = await renderBoardCard()
    expect(link.id).toBe(taskCardId('task-1'))
    expect(taskCardId('task-1')).not.toBe(taskCardId('task-2'))
  })

  it('has a Move button named with the task reference beside the link', async () => {
    const link = await renderBoardCard()
    const button = moveButton()
    expect(button.id).toBe(moveButtonId('task-1'))
    expect(button.getAttribute('aria-haspopup')).toBe('menu')
    expect(button.parentElement).toBe(link.parentElement)
    expect(link.contains(button)).toBe(false)
    // The link's name is the card's content, as before.
    expect(link.textContent).toBe(
      'WEB-7, Fix the footer, High, Due Oct 1, 2026, Overdue, Bug, Design',
    )
  })
})

describe('focusMoveButton', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('focuses a Move button that is already on the page', async () => {
    await renderBoardCards()

    act(() => focusMoveButton('task-1'))

    expect(document.activeElement).toBe(moveButton())
  })

  it('waits for a card that has not rendered yet', async () => {
    act(() => focusMoveButton('task-1'))
    expect(document.activeElement).toBe(document.body)

    await renderBoardCards()

    expect(document.activeElement).toBe(moveButton())
  })

  it('follows a card that moves within its column without remounting', async () => {
    const update = await renderBoardCards({ pair: true })
    const button = moveButton()
    act(() => focusMoveButton('task-1'))
    // React moves the card's li, which can drop focus to the page.
    act(() => button.blur())

    update({ position: 1 })

    expect(document.activeElement).toBe(moveButton())
    expect(moveButton()).toBe(button)
  })

  it('follows a card that moves to another status', async () => {
    const update = await renderBoardCards()
    act(() => focusMoveButton('task-1'))
    act(() => moveButton().blur())

    update({ statusId: 's2' })

    expect(document.activeElement).toBe(moveButton())
  })

  it('drops the wait when focus lands elsewhere', async () => {
    const update = await renderBoardCards({ pair: true })
    act(() => focusMoveButton('task-1'))
    act(() => moveButton('Move WEB-8').focus())

    update({ position: 1 })

    expect(document.activeElement).toBe(moveButton('Move WEB-8'))
  })

  it('drops the wait after a second', async () => {
    const update = await renderBoardCards({ pair: true })
    vi.useFakeTimers()
    act(() => focusMoveButton('task-1'))
    act(() => moveButton().blur())

    act(() => vi.advanceTimersByTime(1000))
    update({ position: 1 })

    expect(document.activeElement).toBe(document.body)
  })
})

describe('focusTaskCard', () => {
  it('focuses a card that is already on the page', async () => {
    const link = await renderBoardCard()
    const holder = holderButton()

    act(() => focusTaskCard('task-1', holder))

    expect(document.activeElement).toBe(link)
    holder.remove()
  })

  it('holds focus until the card renders, then moves it there', async () => {
    const holder = holderButton()

    focusTaskCard('task-1', holder)
    expect(document.activeElement).toBe(holder)

    const link = await renderBoardCard()
    expect(document.activeElement).toBe(link)
    holder.remove()
  })

  it('keeps focus on the holder for another card', async () => {
    const holder = holderButton()

    focusTaskCard('task-2', holder)
    await renderBoardCard()

    expect(document.activeElement).toBe(holder)
    holder.remove()
  })

  it('drops the wait when the holder loses focus to the page', async () => {
    const holder = holderButton()

    focusTaskCard('task-1', holder)
    // A click on a blank part of the page blurs the holder.
    holder.blur()
    await renderBoardCard()

    expect(document.activeElement).toBe(document.body)
    holder.remove()
  })

  it('leaves focus alone once it has left the holder', async () => {
    const holder = holderButton()
    const other = holderButton()

    focusTaskCard('task-1', holder)
    other.focus()
    await renderBoardCard()

    expect(document.activeElement).toBe(other)
    holder.remove()
    other.remove()
  })
})
