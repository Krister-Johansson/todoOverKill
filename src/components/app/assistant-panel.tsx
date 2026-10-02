import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Eraser, Send, Square } from 'lucide-react'
import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react'

import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Textarea } from '#/components/ui/textarea'
import { assistantStatusQueryOptions } from '#/fns/assistant'
import {
  MAX_CHAT_MESSAGE_LENGTH,
  MESSAGE_TOO_LONG_ERROR,
} from '#/lib/assistant'

import { useAnnounce } from './live-region'
import { Markdown } from './markdown'

import type { UIMessage } from '@tanstack/ai-react'

/** Lets the shell move focus into the open panel, as `a` does. */
export type AssistantPanelHandle = { focus: () => void }

/**
 * What the panel says about a failed reply. /api/chat refuses a conversation
 * that is too large with 413, or 400 when a message in it is too long; only
 * clearing it helps then. fetchServerSentEvents throws "HTTP error! status:
 * 413 ..." for those.
 */
function replyErrorText(error: Error) {
  if (/\bstatus: (400|413)\b/.test(error.message)) {
    return 'The conversation is too long to send. Clear the conversation and try again.'
  }
  return 'Could not get a reply. Try again.'
}

const ROLE_NAMES: Partial<Record<UIMessage['role'], string>> = {
  user: 'You',
  assistant: 'Assistant',
}

function messageText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === 'text' ? part.content : ''))
    .join('')
}

type Chat = ReturnType<typeof useChat>

/**
 * The assistant panel: a right-hand Sheet headed "Assistant" that streams
 * text replies from /api/chat. It is non-modal, so the page beside it stays
 * usable (2.4.11, 3.2.5): no overlay, an outside click or focus leaves it
 * open, and Escape closes it only when focus is inside; an Escape outside is
 * left to the page with its default intact. Without
 * OPENROUTER_API_KEY it explains how to turn the assistant on and shows no
 * composer.
 *
 * Radix unmounts the Sheet's content while it is closed, so `useChat` lives
 * here, outside it: the conversation survives a close and reopen, and a reply
 * that is still streaming when the panel closes runs on and is announced
 * when it ends. The reply is announced once it has finished, not while it
 * streams, so a screen reader reads it once. A stop announces "Reply
 * stopped", and an error is shown under the list and announced too; a
 * request the server refuses as too large says to clear the conversation.
 *
 * Focus: opening moves it to the Message field (or the Close button when the
 * assistant is off). Closing returns it to `returnFocusTo`, the top bar's
 * Assistant button, or to the main landmark if that is gone. Below `md` the
 * shell hides that button while the panel is open, so Radix's
 * onCloseAutoFocus, which runs before the shell has re-rendered, could focus
 * an element that is still `display: none` and leave focus on the body.
 * The panel prevents it and moves focus in an effect instead, which runs
 * after the commit that shows the shell again.
 */
export function AssistantPanel({
  open,
  onOpenChange,
  returnFocusTo,
  ref,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo: React.RefObject<HTMLElement | null>
  ref?: React.Ref<AssistantPanelHandle>
}) {
  const { data: status } = useSuspenseQuery(assistantStatusQueryOptions())
  const announce = useAnnounce()
  const contentRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const stopRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(open)
  const wasLoading = useRef(false)
  const stopped = useRef(false)
  // Whether the Stop button was the last element to take focus. Removing it
  // fires no focusin, so this stays true after it is gone.
  const stopHadFocus = useRef(false)
  // Set while Radix handles an Escape pressed with focus outside the panel.
  const ignoreClose = useRef(false)
  const chat = useChat({ connection: fetchServerSentEvents('/api/chat') })
  const { messages, isLoading, error } = chat

  const lastMessage = messages.at(-1)
  const lastText = lastMessage ? messageText(lastMessage) : ''

  useImperativeHandle(ref, () => ({
    focus: () => {
      const target =
        composerRef.current ??
        contentRef.current?.querySelector<HTMLElement>(
          '[data-slot="sheet-close"]',
        )
      target?.focus()
    },
  }))

  useEffect(() => {
    if (wasOpen.current && !open) {
      const target = returnFocusTo.current
      if (target?.isConnected) target.focus()
      if (document.activeElement !== target) {
        document.getElementById('main')?.focus()
      }
    }
    wasOpen.current = open
  }, [open, returnFocusTo])

  useEffect(() => {
    function onFocusIn(event: FocusEvent) {
      stopHadFocus.current = event.target === stopRef.current
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])

  useEffect(() => {
    if (wasLoading.current && !isLoading) {
      // The Stop button has gone. If it had focus, or was just pressed,
      // focus would drop to the body, so it moves to the Message field. Focus
      // the user moved anywhere else, even onto plain text beside the
      // panel, stays where it is (3.2.5).
      const focusLost =
        document.activeElement === null ||
        document.activeElement === document.body
      if (focusLost && (stopHadFocus.current || stopped.current)) {
        composerRef.current?.focus()
      }
      stopHadFocus.current = false
      if (stopped.current) {
        announce('Reply stopped')
      } else if (error) {
        announce(replyErrorText(error))
      } else if (lastMessage?.role === 'assistant' && lastText) {
        announce(`Assistant: ${lastText}`)
      }
      stopped.current = false
    }
    wasLoading.current = isLoading
  }, [isLoading, error, lastMessage, lastText, announce])

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && ignoreClose.current) return
        onOpenChange(next)
      }}
      modal={false}
    >
      <SheetContent
        ref={contentRef}
        id="assistant-panel"
        data-modal="false"
        side="right"
        overlay={false}
        className="w-full gap-0 sm:max-w-none md:w-80 lg:w-96"
        onOpenAutoFocus={(event) => {
          if (!composerRef.current) return
          event.preventDefault()
          composerRef.current.focus()
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          // Radix calls this only while the panel is the top dismissable
          // layer. A dialog opened over it, such as the command menu, takes
          // that place and closes on Escape itself. With focus outside, the
          // Escape belongs to the page: it must keep its default, so a search
          // field such as the filter bar's Text still clears. Radix prevents
          // it itself before dismissing, so that call is made a no-op on this
          // event and the close it asks for is ignored in onOpenChange.
          if (contentRef.current?.contains(document.activeElement)) return
          ignoreClose.current = true
          queueMicrotask(() => {
            ignoreClose.current = false
          })
          Object.defineProperty(event, 'preventDefault', { value: () => {} })
        }}
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Assistant</SheetTitle>
          <SheetDescription>
            Ask questions in plain words. Replies are text only for now.
          </SheetDescription>
        </SheetHeader>
        {status.enabled ? (
          <Conversation
            chat={chat}
            composerRef={composerRef}
            stopRef={stopRef}
            onStop={() => {
              stopped.current = true
              chat.stop()
            }}
          />
        ) : (
          <div className="flex flex-col gap-2 p-4">
            <p>The assistant is off.</p>
            <p>
              To turn it on, set <code>OPENROUTER_API_KEY</code> in the{' '}
              <code>.env</code> file and restart the app. Everything else works
              without it.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * The message list and composer, mounted only while the panel is open. New
 * messages scroll into view; while a reply streams, the list follows it only
 * if it was already scrolled to the end, so rereading earlier messages is
 * not interrupted.
 *
 * A message over MAX_CHAT_MESSAGE_LENGTH is not sent: it stays in the field,
 * and the error under it is shown and announced until the next edit. Clear
 * conversation empties the list and keeps focus on itself.
 */
function Conversation({
  chat: { messages, sendMessage, isLoading, error, stop, clear },
  composerRef,
  stopRef,
  onStop,
}: {
  chat: Chat
  composerRef: React.RefObject<HTMLTextAreaElement | null>
  stopRef: React.RefObject<HTMLButtonElement | null>
  onStop: () => void
}) {
  const id = useId()
  const announce = useAnnounce()
  const [composerError, setComposerError] = useState<string | null>(null)
  const listEnd = useRef<HTMLDivElement>(null)
  const atEnd = useRef(true)
  const shownCount = useRef(0)

  const lastMessage = messages.at(-1)
  const lastText = lastMessage ? messageText(lastMessage) : ''

  useEffect(() => {
    const added = messages.length !== shownCount.current
    shownCount.current = messages.length
    if (added || atEnd.current) {
      listEnd.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [messages.length, lastText])

  function send() {
    const composer = composerRef.current
    if (!composer || isLoading) return
    const text = composer.value.trim()
    if (!text) return
    if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
      setComposerError(MESSAGE_TOO_LONG_ERROR)
      announce(MESSAGE_TOO_LONG_ERROR)
      return
    }
    setComposerError(null)
    composer.value = ''
    void sendMessage(text)
  }

  function clearConversation() {
    if (messages.length === 0) return
    if (isLoading) stop()
    clear()
    announce('Conversation cleared')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex-1 overflow-y-auto p-4"
        onScroll={(event) => {
          const list = event.currentTarget
          atEnd.current =
            list.scrollHeight - list.scrollTop - list.clientHeight < 32
        }}
      >
        <h3 id={`${id}-conversation`} className="sr-only">
          Conversation
        </h3>
        {messages.length === 0 ? (
          <p className="text-muted-foreground">
            No messages yet. Write one below.
          </p>
        ) : null}
        <ol
          aria-labelledby={`${id}-conversation`}
          className="flex flex-col gap-4"
        >
          {messages.map((message) => (
            <li key={message.id} className="flex flex-col gap-1">
              <span className="text-sm font-semibold">
                {ROLE_NAMES[message.role] ?? message.role}
              </span>
              <div className="max-w-prose">
                <Markdown headingLevel={3}>{messageText(message)}</Markdown>
              </div>
            </li>
          ))}
        </ol>
        {error && !isLoading ? (
          <p className="mt-4">{replyErrorText(error)}</p>
        ) : null}
        <div ref={listEnd} />
      </div>
      <form
        className="flex flex-col gap-2 border-t border-border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <Label htmlFor={`${id}-message`}>Message</Label>
        <Textarea
          ref={composerRef}
          id={`${id}-message`}
          name="message"
          aria-describedby={
            composerError
              ? `${id}-message-help ${id}-message-error`
              : `${id}-message-help`
          }
          aria-invalid={composerError ? true : undefined}
          // A long message scrolls inside the field rather than pushing the
          // conversation out of the panel.
          className="max-h-48"
          onChange={() => setComposerError(null)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              send()
            }
          }}
        />
        <p id={`${id}-message-help`} className="text-sm text-muted-foreground">
          Enter sends. Shift+Enter starts a new line.
        </p>
        {composerError ? (
          <p
            id={`${id}-message-error`}
            className="text-sm font-medium text-destructive"
          >
            {composerError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {/* aria-disabled rather than disabled, which would drop focus from
              a Send button pressed with the keyboard. send() ignores it. */}
          <Button type="submit" aria-disabled={isLoading}>
            <Send aria-hidden="true" />
            Send
          </Button>
          {isLoading ? (
            <Button
              ref={stopRef}
              type="button"
              variant="outline"
              onClick={onStop}
            >
              <Square aria-hidden="true" />
              Stop
            </Button>
          ) : null}
          {/* aria-disabled, not hidden or disabled, so focus stays on it
              once the list is empty. */}
          <Button
            type="button"
            variant="outline"
            aria-disabled={messages.length === 0}
            onClick={clearConversation}
          >
            <Eraser aria-hidden="true" />
            Clear conversation
          </Button>
        </div>
      </form>
    </div>
  )
}
