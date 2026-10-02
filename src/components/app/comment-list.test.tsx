import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addCommentFn, deleteCommentFn, updateCommentFn } from '#/fns/comments'

import { CommentList } from './comment-list'
import { LiveRegionProvider } from './live-region'

import type { Comment } from './comment-list'

vi.mock('#/fns/comments', () => ({
  commentsQueryOptions: (id: string) => ({
    queryKey: ['tasks', id, 'comments'],
    // A refetch never lands, so the cache shows what the component wrote.
    queryFn: () => new Promise(() => {}),
  }),
  addCommentFn: vi.fn(),
  updateCommentFn: vi.fn(),
  deleteCommentFn: vi.fn(),
}))

vi.mock('#/fns/tasks', () => ({
  taskActivityQueryOptions: (id: string) => ({
    queryKey: ['tasks', id, 'activity'],
  }),
}))

const add = vi.mocked(addCommentFn)
const update = vi.mocked(updateCommentFn)
const remove = vi.mocked(deleteCommentFn)
const commentsKey = ['tasks', 't1', 'comments']
const now = new Date('2026-10-01T12:00:00.000Z')

function comment(id: string, body: string, { edited = false } = {}): Comment {
  const createdAt = new Date('2026-10-01T10:00:00.000Z')
  return {
    id,
    taskId: 't1',
    body,
    createdAt,
    updatedAt: edited ? new Date('2026-10-01T11:00:00.000Z') : createdAt,
  }
}

/** A promise and the functions that settle it, to hold a request open. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let queryClient: QueryClient

function renderList(rows: Array<Comment>) {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, retry: false },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData(commentsKey, rows)
  render(
    <QueryClientProvider client={queryClient}>
      <LiveRegionProvider>
        <CommentList taskId="t1" now={now} />
      </LiveRegionProvider>
    </QueryClientProvider>,
  )
  return screen.getByRole('region', { name: 'Comments' })
}

function liveRegion() {
  return document.querySelector('[aria-live="polite"]')!
}

async function expectAnnounced(message: string) {
  await waitFor(() => expect(liveRegion().textContent).toBe(message))
}

function article(name: string) {
  return screen.getByRole('article', { name })
}

function button(name: string) {
  return screen.getByRole('button', { name })
}

function composer() {
  return screen.getByRole('textbox', { name: 'New comment' })
}

function cached() {
  return queryClient.getQueryData<Array<Comment>>(commentsKey)
}

/** Presses a button the way a keyboard user does: focus, then activate. */
function press(element: HTMLElement) {
  element.focus()
  fireEvent.click(element)
}

beforeEach(() => {
  // jsdom has no ResizeObserver, which the Markdown code blocks use.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

describe('CommentList', () => {
  it('lists the comments oldest first as named articles', () => {
    const region = renderList([
      comment('c1', 'First'),
      comment('c2', 'Second', { edited: true }),
    ])

    expect(
      within(region).getByRole('heading', { level: 2, name: 'Comments' }),
    ).toBeTruthy()
    const articles = within(region).getAllByRole('article')
    expect(articles.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Comment 1',
      'Comment 2',
    ])
    expect(within(articles[0]).getByText('First')).toBeTruthy()
    const time = articles[0].querySelector('time')!
    expect(time.getAttribute('datetime')).toBe('2026-10-01T10:00:00.000Z')
    expect(time.textContent).toMatch(/^2 hours ago \(.+\)$/)
    expect(time.parentElement?.textContent).not.toMatch(/edited/)
    expect(
      articles[1].querySelector('time')?.parentElement?.textContent,
    ).toMatch(/\), edited$/)
    // Each button's name starts with its visible word.
    expect(button('Edit Comment 1')).toBeTruthy()
    expect(button('Delete Comment 2')).toBeTruthy()
    expect(composer()).toBeTruthy()
    expect(button('Add comment')).toBeTruthy()
  })

  it('says so when there are no comments', () => {
    const region = renderList([])

    expect(within(region).getByText('No comments yet')).toBeTruthy()
    expect(within(region).queryByRole('list')).toBeNull()
  })

  it('renders Markdown, raw HTML as text, and no link for a javascript: URL', () => {
    renderList([
      comment(
        'c1',
        '**Bold** <b>raw</b> [bad](javascript:alert(1)) [good](https://example.com)',
      ),
    ])
    const item = article('Comment 1')

    expect(within(item).getByText('Bold').tagName).toBe('STRONG')
    expect(item.querySelector('b')).toBeNull()
    expect(item.textContent).toContain('<b>')
    expect(within(item).queryByRole('link', { name: 'bad' })).toBeNull()
    expect(within(item).getByText('bad')).toBeTruthy()
    expect(
      within(item).getByRole('link', { name: 'good' }).getAttribute('href'),
    ).toBe('https://example.com')
  })

  it('adds a comment, moves focus to it and announces it', async () => {
    renderList([comment('c1', 'First')])
    add.mockResolvedValue(comment('c2', 'Second'))
    const field = composer()

    field.focus()
    fireEvent.change(field, { target: { value: 'Second' } })
    fireEvent.submit(field.closest('form')!)

    await expectAnnounced('Comment added')
    expect(add).toHaveBeenCalledWith({
      data: { taskId: 't1', data: { body: 'Second' } },
    })
    expect(cached()?.map((row) => row.id)).toEqual(['c1', 'c2'])
    expect((field as HTMLTextAreaElement).value).toBe('')
    await waitFor(() =>
      expect(document.activeElement).toBe(article('Comment 2')),
    )
  })

  it('shows an empty comment in a focused summary and announces it', async () => {
    renderList([])
    const field = composer()

    field.focus()
    fireEvent.change(field, { target: { value: '   ' } })
    fireEvent.submit(field.closest('form')!)

    expect(add).not.toHaveBeenCalled()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(
      document.getElementById(field.getAttribute('aria-describedby')!)
        ?.textContent,
    ).toBe('Comment is required.')
    const summary = screen.getByRole('heading', {
      name: 'Fix these fields',
    }).parentElement!
    await waitFor(() => expect(document.activeElement).toBe(summary))
    await expectAnnounced('Comment is required.')

    // The summary links to the field.
    fireEvent.click(
      within(summary).getByRole('link', {
        name: 'New comment: Comment is required.',
      }),
    )
    expect(document.activeElement).toBe(field)
  })

  it('keeps the text, shows the problem and announces a failed add', async () => {
    renderList([])
    add.mockRejectedValue(new Error('down'))
    const field = composer()

    fireEvent.change(field, { target: { value: 'Hello' } })
    press(button('Add comment'))

    await expectAnnounced('Could not add the comment. Try again.')
    expect((field as HTMLTextAreaElement).value).toBe('Hello')
    const summary = screen.getByRole('heading', {
      name: 'There is a problem',
    }).parentElement!
    expect(summary.textContent).toContain(
      'Could not add the comment. Try again.',
    )
    await waitFor(() => expect(document.activeElement).toBe(summary))
  })

  it('edits a comment, returns focus to Edit and announces it', async () => {
    renderList([comment('c1', 'First')])
    update.mockResolvedValue(comment('c1', 'Changed', { edited: true }))

    press(button('Edit Comment 1'))
    const field = screen.getByRole('textbox', { name: 'Edit comment' })
    await waitFor(() => expect(document.activeElement).toBe(field))
    expect((field as HTMLTextAreaElement).value).toBe('First')
    fireEvent.change(field, { target: { value: 'Changed' } })
    fireEvent.submit(field.closest('form')!)

    await expectAnnounced('Comment edited')
    expect(update).toHaveBeenCalledWith({
      data: { commentId: 'c1', data: { body: 'Changed' } },
    })
    expect(within(article('Comment 1')).getByText('Changed')).toBeTruthy()
    expect(article('Comment 1').textContent).toMatch(/, edited/)
    await waitFor(() =>
      expect(document.activeElement).toBe(button('Edit Comment 1')),
    )
  })

  it('cancels an edit with Escape and saves an unchanged body with no request', async () => {
    renderList([comment('c1', 'First')])

    press(button('Edit Comment 1'))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit comment' }), {
      key: 'Escape',
    })
    await waitFor(() =>
      expect(document.activeElement).toBe(button('Edit Comment 1')),
    )

    press(button('Edit Comment 1'))
    // A click on a submit button submits its form.
    press(button('Save'))
    await waitFor(() =>
      expect(document.activeElement).toBe(button('Edit Comment 1')),
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('shows an empty edit in a focused summary and announces it', async () => {
    renderList([comment('c1', 'First')])

    press(button('Edit Comment 1'))
    const field = screen.getByRole('textbox', { name: 'Edit comment' })
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.submit(field.closest('form')!)

    expect(update).not.toHaveBeenCalled()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    const summary = screen.getByRole('heading', {
      name: 'Fix these fields',
    }).parentElement!
    await waitFor(() => expect(document.activeElement).toBe(summary))
    await expectAnnounced('Comment is required.')
  })

  it('announces a failed edit and keeps the form open', async () => {
    renderList([comment('c1', 'First')])
    update.mockRejectedValue(new Error('down'))

    press(button('Edit Comment 1'))
    const field = screen.getByRole('textbox', { name: 'Edit comment' })
    fireEvent.change(field, { target: { value: 'Changed' } })
    fireEvent.submit(field.closest('form')!)

    await expectAnnounced('Could not edit the comment. Try again.')
    expect((field as HTMLTextAreaElement).value).toBe('Changed')
    expect(screen.getByText('There is a problem')).toBeTruthy()
  })

  it('leaves an edit opened after Cancel alone when the earlier save lands', async () => {
    renderList([comment('c1', 'First')])
    const request = deferred<Comment>()
    update.mockReturnValue(request.promise)

    press(button('Edit Comment 1'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit comment' }), {
      target: { value: 'Changed' },
    })
    fireEvent.submit(button('Save').closest('form')!)
    press(button('Cancel'))
    press(button('Edit Comment 1'))
    const reopened = screen.getByRole('textbox', { name: 'Edit comment' })
    fireEvent.change(reopened, { target: { value: 'Typing again' } })
    reopened.focus()

    await act(async () => {
      request.resolve(comment('c1', 'Changed', { edited: true }))
      await request.promise
    })

    await expectAnnounced('Comment edited')
    expect(screen.getByRole('textbox', { name: 'Edit comment' })).toBe(reopened)
    expect((reopened as HTMLTextAreaElement).value).toBe('Typing again')
    expect(document.activeElement).toBe(reopened)
  })

  it('deletes after confirming, focuses the next comment and announces it', async () => {
    renderList([comment('c1', 'First'), comment('c2', 'Second')])
    remove.mockResolvedValue(comment('c1', 'First'))

    press(button('Delete Comment 1'))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete this comment?',
    })
    expect(within(dialog).getByText(/Comment 1 will be removed/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await expectAnnounced('Comment deleted')
    expect(remove).toHaveBeenCalledWith({ data: 'c1' })
    expect(cached()?.map((row) => row.id)).toEqual(['c2'])
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() =>
      expect(document.activeElement).toBe(article('Comment 1')),
    )
    expect(within(article('Comment 1')).getByText('Second')).toBeTruthy()
  })

  it('focuses the previous comment, else the composer, after a delete', async () => {
    renderList([comment('c1', 'First'), comment('c2', 'Second')])
    remove.mockResolvedValueOnce(comment('c2', 'Second'))

    press(button('Delete Comment 2'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(document.activeElement).toBe(article('Comment 1')),
    )

    remove.mockResolvedValueOnce(comment('c1', 'First'))
    press(button('Delete Comment 1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(document.activeElement).toBe(composer()))
    expect(screen.getByText('No comments yet')).toBeTruthy()
  })

  it('returns focus to the Delete button when the dialog is cancelled', async () => {
    renderList([comment('c1', 'First')])

    press(button('Delete Comment 1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() =>
      expect(document.activeElement).toBe(button('Delete Comment 1')),
    )
    expect(remove).not.toHaveBeenCalled()
  })

  it('keeps the dialog open while a delete is pending and ignores a second press', async () => {
    renderList([comment('c1', 'First')])
    const request = deferred<Comment>()
    remove.mockReturnValue(request.promise)

    press(button('Delete Comment 1'))
    const confirm = await screen.findByRole('button', { name: 'Delete' })
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(confirm.getAttribute('aria-disabled')).toBe('true'),
    )
    fireEvent.click(confirm)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(confirm, { key: 'Escape' })

    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(remove).toHaveBeenCalledTimes(1)
    await act(async () => {
      request.resolve(comment('c1', 'First'))
      await request.promise
    })
    await expectAnnounced('Comment deleted')
  })

  it('announces a failed delete and leaves focus on the Delete button', async () => {
    renderList([comment('c1', 'First')])
    remove.mockRejectedValue(new Error('down'))

    press(button('Delete Comment 1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await expectAnnounced('Could not delete the comment. Try again.')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() =>
      expect(document.activeElement).toBe(button('Delete Comment 1')),
    )
    expect(cached()?.map((row) => row.id)).toEqual(['c1'])
  })

  it('moves focus to the comment in its place when the focused one disappears', async () => {
    renderList([comment('c1', 'First'), comment('c2', 'Second')])
    button('Edit Comment 1').focus()

    // A refetch finds the comment deleted in another tab.
    act(() => {
      queryClient.setQueryData(commentsKey, [comment('c2', 'Second')])
    })

    await waitFor(() =>
      expect(document.activeElement).toBe(article('Comment 1')),
    )
    expect(within(article('Comment 1')).getByText('Second')).toBeTruthy()
  })
})
