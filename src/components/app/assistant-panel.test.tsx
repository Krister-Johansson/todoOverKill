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
import { createRef, useRef, useState } from 'react'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'

import { AssistantPanel } from './assistant-panel'
import { LiveRegionProvider } from './live-region'

import type { AssistantPanelHandle } from './assistant-panel'

type ChatState = {
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    parts: Array<{ type: 'text'; content: string }>
  }>
  isLoading: boolean
  error: Error | undefined
}

const chat = vi.hoisted(() => {
  const state: ChatState = { messages: [], isLoading: false, error: undefined }
  return { state, sendMessage: vi.fn(), stop: vi.fn(), clear: vi.fn() }
})

// No fetch leaves the test: useChat is a stand-in driven by `chat.state`.
// A sent message is kept in the hook's own state, as the real hook keeps it,
// so it is lost if the component that calls useChat unmounts.
vi.mock('@tanstack/ai-react', async () => {
  const React = await import('react')
  return {
    fetchServerSentEvents: vi.fn(),
    useChat: () => {
      const [sent, setSent] = React.useState<ChatState['messages']>([])
      return {
        ...chat.state,
        messages: [...chat.state.messages, ...sent],
        sendMessage: (text: string) => {
          chat.sendMessage(text)
          setSent((messages) => [
            ...messages,
            {
              id: `sent-${messages.length}`,
              role: 'user',
              parts: [{ type: 'text', content: text }],
            },
          ])
        },
        stop: chat.stop,
        clear: () => {
          chat.clear()
          chat.state = { ...chat.state, messages: [], error: undefined }
          setSent([])
        },
      }
    },
  }
})

vi.mock('#/fns/assistant', () => ({
  assistantStatusQueryOptions: () => ({ queryKey: ['assistant', 'status'] }),
}))

const nativeFocus = HTMLElement.prototype.focus

beforeAll(() => {
  // jsdom does not lay out, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn()
  // jsdom focuses an element inside `hidden` (display: none) anyway; a
  // browser does not. Refusing it here, as a browser would, makes the focus
  // return test fail if focus moved before the shell was shown again.
  HTMLElement.prototype.focus = function focus(options) {
    if (this.closest('[hidden]')) return
    nativeFocus.call(this, options)
  }
})

afterAll(() => {
  HTMLElement.prototype.focus = nativeFocus
})

afterEach(() => {
  cleanup()
  chat.state = { messages: [], isLoading: false, error: undefined }
  chat.sendMessage.mockReset()
  chat.stop.mockReset()
  chat.clear.mockReset()
})

/**
 * Mirrors the shell: the Assistant button sits in a wrapper that is `hidden`
 * while the panel is open, as the shell grid is below `md`, and the panel
 * renders beside it.
 */
function Harness({ panelRef }: { panelRef?: React.Ref<AssistantPanelHandle> }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <div hidden={open}>
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          Assistant
        </button>
        <a href="#elsewhere">Elsewhere</a>
        <main id="main" tabIndex={-1} />
      </div>
      <AssistantPanel
        ref={panelRef}
        open={open}
        onOpenChange={setOpen}
        returnFocusTo={buttonRef}
      />
    </>
  )
}

/** A modal dialog, like the command menu, that opens over the panel. */
function StackedDialog() {
  return (
    <Dialog>
      <DialogTrigger>Command menu</DialogTrigger>
      <DialogContent>
        <DialogTitle>Command menu</DialogTitle>
        <DialogDescription>Escape closes it.</DialogDescription>
        <input aria-label="Search" />
      </DialogContent>
    </Dialog>
  )
}

function renderPanel({
  enabled = true,
  panelRef,
}: {
  enabled?: boolean
  panelRef?: React.Ref<AssistantPanelHandle>
} = {}) {
  const queryClient = new QueryClient()
  queryClient.setQueryData(['assistant', 'status'], {
    enabled,
    model: 'openai/gpt-4o-mini',
  })
  // A new element each time, so a rerender reads the changed chat state.
  const ui = () => (
    <QueryClientProvider client={queryClient}>
      <LiveRegionProvider>
        <Harness panelRef={panelRef} />
        <StackedDialog />
      </LiveRegionProvider>
    </QueryClientProvider>
  )
  const result = render(ui())
  return { ...result, rerender: () => result.rerender(ui()) }
}

function openPanel() {
  const button = screen.getByRole('button', { name: 'Assistant' })
  button.focus()
  fireEvent.click(button)
  return screen.getByRole('dialog', { name: 'Assistant' })
}

function liveRegion() {
  const region = document.querySelector('[aria-live="polite"]')
  if (!region) throw new Error('no live region')
  return region
}

describe('AssistantPanel', () => {
  it('explains how to turn the assistant on when the key is missing', () => {
    renderPanel({ enabled: false })
    const panel = openPanel()

    expect(panel.textContent).toContain('The assistant is off.')
    expect(panel.textContent).toContain('OPENROUTER_API_KEY')
    expect(within(panel).queryByRole('textbox')).toBeNull()
    expect(within(panel).getByRole('button', { name: 'Close' })).toBe(
      document.activeElement,
    )
  })

  it('moves focus to Close when asked to focus a panel that is off', () => {
    const panelRef = createRef<AssistantPanelHandle>()
    renderPanel({ enabled: false, panelRef })
    const panel = openPanel()
    ;(document.activeElement as HTMLElement).blur()
    expect(document.activeElement).toBe(document.body)

    act(() => panelRef.current?.focus())
    expect(document.activeElement).toBe(
      within(panel).getByRole('button', { name: 'Close' }),
    )
  })

  it('has a heading, a labelled Message field and a Send button', () => {
    renderPanel()
    const panel = openPanel()

    expect(
      within(panel).getByRole('heading', { level: 2, name: 'Assistant' }),
    ).toBeTruthy()
    const message = within(panel).getByRole('textbox', { name: 'Message' })
    expect(message).toBe(document.activeElement)
    expect(within(panel).getByRole('button', { name: 'Send' })).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(
      within(panel).getByRole('list', { name: 'Conversation' }),
    ).toBeTruthy()
    expect(panel.getAttribute('data-modal')).toBe('false')
  })

  it('sends on Enter and ignores an empty message', () => {
    renderPanel()
    const panel = openPanel()
    const message = within(panel).getByRole('textbox', { name: 'Message' })

    fireEvent.keyDown(message, { key: 'Enter' })
    expect(chat.sendMessage).not.toHaveBeenCalled()

    fireEvent.change(message, { target: { value: '  Hello  ' } })
    fireEvent.keyDown(message, { key: 'Enter' })
    expect(chat.sendMessage).toHaveBeenCalledWith('Hello')
    expect((message as HTMLTextAreaElement).value).toBe('')
  })

  it('lists messages with who wrote them', () => {
    chat.state.messages = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', content: 'Hi' }] },
      {
        id: 'm2',
        role: 'assistant',
        parts: [{ type: 'text', content: 'Hello there' }],
      },
    ]
    renderPanel()
    const panel = openPanel()

    const items = within(
      within(panel).getByRole('list', { name: 'Conversation' }),
    ).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'YouHi',
      'AssistantHello there',
    ])
  })

  it('stops a streaming reply, announces it and keeps focus in the panel', async () => {
    chat.state.isLoading = true
    const { rerender } = renderPanel()
    const panel = openPanel()

    const stop = within(panel).getByRole('button', { name: 'Stop' })
    stop.focus()
    fireEvent.click(stop)
    expect(chat.stop).toHaveBeenCalledOnce()

    chat.state.isLoading = false
    rerender()
    expect(within(panel).queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(within(panel).getByRole('textbox', { name: 'Message' })).toBe(
      document.activeElement,
    )
    await waitFor(() => expect(liveRegion().textContent).toBe('Reply stopped'))
  })

  it('keeps the conversation when the panel closes and opens again', async () => {
    renderPanel()
    let panel = openPanel()
    const message = within(panel).getByRole('textbox', { name: 'Message' })
    fireEvent.change(message, { target: { value: 'Hello' } })
    fireEvent.keyDown(message, { key: 'Enter' })

    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Assistant' })).toBeNull(),
    )
    panel = openPanel()

    const items = within(
      within(panel).getByRole('list', { name: 'Conversation' }),
    ).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['YouHello'])
    expect(panel.textContent).not.toContain('No messages yet')
  })

  it('lets a reply run on and announces it when the panel closes', async () => {
    chat.state.isLoading = true
    const { rerender } = renderPanel()
    const panel = openPanel()
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Assistant' })).toBeNull(),
    )
    expect(chat.stop).not.toHaveBeenCalled()

    chat.state.isLoading = false
    chat.state.messages = [
      {
        id: 'm2',
        role: 'assistant',
        parts: [{ type: 'text', content: 'Done.' }],
      },
    ]
    rerender()
    await waitFor(() =>
      expect(liveRegion().textContent).toBe('Assistant: Done.'),
    )
  })

  it('leaves focus alone when a reply ends after focus left the panel', () => {
    chat.state.isLoading = true
    const { rerender } = renderPanel()
    openPanel()
    // As a click on plain text beside the panel does.
    ;(document.activeElement as HTMLElement).blur()
    expect(document.activeElement).toBe(document.body)

    chat.state.isLoading = false
    rerender()
    expect(document.activeElement).toBe(document.body)
  })

  it('announces a finished reply', async () => {
    chat.state.isLoading = true
    const { rerender } = renderPanel()
    openPanel()

    chat.state.isLoading = false
    chat.state.messages = [
      {
        id: 'm2',
        role: 'assistant',
        parts: [{ type: 'text', content: 'Done.' }],
      },
    ]
    rerender()
    await waitFor(() =>
      expect(liveRegion().textContent).toBe('Assistant: Done.'),
    )
  })

  it('shows and announces an error', async () => {
    chat.state.isLoading = true
    const { rerender } = renderPanel()
    const panel = openPanel()

    chat.state.isLoading = false
    chat.state.error = new Error('HTTP error! status: 500')
    rerender()
    expect(panel.textContent).toContain('Could not get a reply. Try again.')
    await waitFor(() =>
      expect(liveRegion().textContent).toBe(
        'Could not get a reply. Try again.',
      ),
    )
  })

  it('shows and announces a specific error for a refused request', async () => {
    chat.state.isLoading = true
    const { rerender } = renderPanel()
    const panel = openPanel()
    const text =
      'The conversation is too long to send. Clear the conversation and try again.'

    chat.state.isLoading = false
    chat.state.error = new Error('HTTP error! status: 413 Payload Too Large')
    rerender()
    expect(panel.textContent).toContain(text)
    expect(panel.textContent).not.toContain('Could not get a reply')
    await waitFor(() => expect(liveRegion().textContent).toBe(text))
  })

  it('refuses a message over 20,000 characters and keeps it', async () => {
    renderPanel()
    const panel = openPanel()
    const message = within(panel).getByRole('textbox', { name: 'Message' })
    const long = 'x'.repeat(20_001)

    fireEvent.change(message, { target: { value: long } })
    fireEvent.keyDown(message, { key: 'Enter' })
    expect(chat.sendMessage).not.toHaveBeenCalled()
    expect((message as HTMLTextAreaElement).value).toBe(long)

    const error = within(panel).getByText(
      'Messages can be up to 20,000 characters.',
    )
    expect(message.getAttribute('aria-describedby')?.split(' ')).toContain(
      error.id,
    )
    expect(message.getAttribute('aria-invalid')).toBe('true')
    await waitFor(() =>
      expect(liveRegion().textContent).toBe(
        'Messages can be up to 20,000 characters.',
      ),
    )

    // The next edit clears the error, and a message within the limit sends.
    fireEvent.change(message, { target: { value: 'x'.repeat(20_000) } })
    expect(
      within(panel).queryByText('Messages can be up to 20,000 characters.'),
    ).toBeNull()
    expect(message.getAttribute('aria-describedby')).not.toContain(error.id)
    fireEvent.keyDown(message, { key: 'Enter' })
    expect(chat.sendMessage).toHaveBeenCalledWith('x'.repeat(20_000))
  })

  it('clears the conversation, announces it and keeps focus', async () => {
    chat.state.messages = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', content: 'Hi' }] },
    ]
    const { rerender } = renderPanel()
    const panel = openPanel()
    const clear = within(panel).getByRole('button', {
      name: 'Clear conversation',
    })
    expect(clear.getAttribute('aria-disabled')).toBe('false')

    clear.focus()
    fireEvent.click(clear)
    rerender()
    expect(chat.clear).toHaveBeenCalledOnce()
    expect(chat.stop).not.toHaveBeenCalled()
    expect(within(panel).queryAllByRole('listitem')).toHaveLength(0)
    expect(panel.textContent).toContain('No messages yet')
    expect(document.activeElement).toBe(clear)
    expect(clear.getAttribute('aria-disabled')).toBe('true')
    await waitFor(() =>
      expect(liveRegion().textContent).toBe('Conversation cleared'),
    )
  })

  it('stops a streaming reply before clearing', () => {
    chat.state.isLoading = true
    chat.state.messages = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', content: 'Hi' }] },
    ]
    renderPanel()
    const panel = openPanel()

    fireEvent.click(
      within(panel).getByRole('button', { name: 'Clear conversation' }),
    )
    expect(chat.stop).toHaveBeenCalledOnce()
    expect(chat.clear).toHaveBeenCalledOnce()
    expect(chat.stop.mock.invocationCallOrder[0]).toBeLessThan(
      chat.clear.mock.invocationCallOrder[0],
    )
  })

  it('does nothing on Clear conversation with no messages', () => {
    renderPanel()
    const panel = openPanel()
    const clear = within(panel).getByRole('button', {
      name: 'Clear conversation',
    })
    expect(clear.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(clear)
    expect(chat.clear).not.toHaveBeenCalled()
  })

  it('stays open on Escape while focus is outside it', () => {
    renderPanel()
    openPanel()
    // The shell is not hidden from md up; show it to move focus there.
    const wrapper = screen.getByText('Elsewhere').parentElement
    wrapper?.removeAttribute('hidden')
    const elsewhere = screen.getByText('Elsewhere')
    elsewhere.focus()
    fireEvent.keyDown(elsewhere, { key: 'Escape' })

    expect(screen.getByRole('dialog', { name: 'Assistant' })).toBeTruthy()
  })

  it('leaves the default of an Escape outside it to the page', async () => {
    renderPanel()
    const panel = openPanel()
    const wrapper = screen.getByText('Elsewhere').parentElement
    wrapper?.removeAttribute('hidden')
    const elsewhere = screen.getByText('Elsewhere')
    elsewhere.focus()
    let seenPrevented: boolean | undefined
    elsewhere.addEventListener('keydown', (event) => {
      seenPrevented = event.defaultPrevented
    })

    // fireEvent returns false when the default was prevented.
    expect(fireEvent.keyDown(elsewhere, { key: 'Escape' })).toBe(true)
    expect(seenPrevented).toBe(false)
    expect(screen.getByRole('dialog', { name: 'Assistant' })).toBeTruthy()

    // The ignored close does not swallow the next one, even one asked for
    // while focus is still outside, as a click on Close in Safari leaves it.
    await Promise.resolve()
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Assistant' })).toBeNull(),
    )
  })

  it('leaves Escape to a dialog opened over it', async () => {
    renderPanel()
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Command menu' }))
    const menu = await screen.findByRole('dialog', { name: 'Command menu' })
    const search = within(menu).getByRole('textbox', { name: 'Search' })
    await waitFor(() => expect(document.activeElement).toBe(search))

    fireEvent.keyDown(search, { key: 'Escape' })

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command menu' })).toBeNull(),
    )
    expect(screen.getByRole('dialog', { name: 'Assistant' })).toBeTruthy()
  })

  it.each([
    [
      'Close',
      (panel: HTMLElement) =>
        fireEvent.click(within(panel).getByRole('button', { name: 'Close' })),
    ],
    [
      'Escape',
      (panel: HTMLElement) =>
        fireEvent.keyDown(within(panel).getByRole('textbox'), {
          key: 'Escape',
        }),
    ],
  ])(
    'returns focus to the hidden Assistant button after %s',
    async (_name, close) => {
      renderPanel()
      const panel = openPanel()
      expect(screen.getByText('Elsewhere').closest('[hidden]')).not.toBeNull()

      act(() => close(panel))

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Assistant' })).toBeNull(),
      )
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Assistant' }),
      )
    },
  )
})
