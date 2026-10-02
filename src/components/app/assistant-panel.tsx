import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Send, Square } from 'lucide-react'
import { useEffect, useId, useImperativeHandle, useRef } from 'react'

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

import { useAnnounce } from './live-region'
import { Markdown } from './markdown'

import type { UIMessage } from '@tanstack/ai-react'

/** Lets the shell move focus to the composer, as `a` does on an open panel. */
export type AssistantPanelHandle = { focusComposer: () => void }

const REPLY_ERROR = 'Could not get a reply. Try again.'

const ROLE_NAMES: Partial<Record<UIMessage['role'], string>> = {
  user: 'You',
  assistant: 'Assistant',
}

function messageText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === 'text' ? part.content : ''))
    .join('')
}

/**
 * The assistant panel: a right-hand Sheet headed "Assistant" that streams
 * text replies from /api/chat. It is non-modal, so the page beside it stays
 * usable (2.4.11, 3.2.5): no overlay, an outside click or focus leaves it
 * open, and Escape closes it only when focus is inside. `useChat` lives here,
 * and the panel stays mounted while closed, so the conversation survives a
 * close and reopen. Without OPENROUTER_API_KEY it explains how to turn the
 * assistant on and shows no composer.
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
  const contentRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const wasOpen = useRef(open)

  useImperativeHandle(ref, () => ({
    focusComposer: () => composerRef.current?.focus(),
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
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
          if (!contentRef.current?.contains(document.activeElement)) {
            event.preventDefault()
          }
        }}
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Assistant</SheetTitle>
          <SheetDescription>
            Ask questions in plain words. Replies are text only for now.
          </SheetDescription>
        </SheetHeader>
        {status.enabled ? (
          <Conversation composerRef={composerRef} />
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
 * The message list and composer. The reply is announced through the live
 * region once it has finished, not while it streams, so a screen reader reads
 * it once. A stop announces "Reply stopped", and an error is shown under the
 * list and announced too.
 */
function Conversation({
  composerRef,
}: {
  composerRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const announce = useAnnounce()
  const id = useId()
  const listEnd = useRef<HTMLDivElement>(null)
  const stopFocused = useRef(false)
  const stopped = useRef(false)
  const wasLoading = useRef(false)
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  const lastMessage = messages.at(-1)
  const lastText = lastMessage ? messageText(lastMessage) : ''

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length, lastText])

  useEffect(() => {
    if (wasLoading.current && !isLoading) {
      // The Stop button has gone. If it had focus, focus would drop to the
      // body, so it moves to the Message field instead.
      if (stopFocused.current || document.activeElement === document.body) {
        composerRef.current?.focus()
      }
      stopFocused.current = false
      if (stopped.current) {
        announce('Reply stopped')
      } else if (error) {
        announce(REPLY_ERROR)
      } else if (lastMessage?.role === 'assistant' && lastText) {
        announce(`Assistant: ${lastText}`)
      }
      stopped.current = false
    }
    wasLoading.current = isLoading
  }, [isLoading, error, lastMessage, lastText, announce, composerRef])

  function send() {
    const composer = composerRef.current
    if (!composer || isLoading) return
    const text = composer.value.trim()
    if (!text) return
    composer.value = ''
    void sendMessage(text)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-4">
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
        {error && !isLoading ? <p className="mt-4">{REPLY_ERROR}</p> : null}
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
          aria-describedby={`${id}-message-help`}
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
        <div className="flex flex-wrap gap-2">
          {/* aria-disabled rather than disabled, which would drop focus from
              a Send button pressed with the keyboard. send() ignores it. */}
          <Button type="submit" aria-disabled={isLoading}>
            <Send aria-hidden="true" />
            Send
          </Button>
          {isLoading ? (
            <Button
              type="button"
              variant="outline"
              onFocus={() => (stopFocused.current = true)}
              onBlur={() => (stopFocused.current = false)}
              onClick={() => {
                stopped.current = true
                stop()
              }}
            >
              <Square aria-hidden="true" />
              Stop
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
