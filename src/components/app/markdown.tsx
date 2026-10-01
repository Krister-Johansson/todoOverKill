import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { useOverflowsX } from '#/hooks/use-overflows-x'
import { cn } from '#/lib/utils'

import type { Components } from 'react-markdown'
import type { ReactNode, RefObject } from 'react'

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

/**
 * A code block or table that scrolls sideways inside itself, never the page
 * (1.4.10). Like the board, it is a named region and a Tab stop only while it
 * overflows, or while it holds focus, so keyboard users can scroll it, and a
 * description with many short snippets adds no landmarks or Tab stops.
 */
function ScrollableBlock({
  label,
  children,
}: {
  label: string
  children: (contentRef: RefObject<HTMLElement | null>) => ReactNode
}) {
  const regionRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLElement>(null)
  const scrollable = useOverflowsX(regionRef, contentRef)
  const [regionFocused, setRegionFocused] = useState(false)
  const isRegion = scrollable || regionFocused

  return (
    <div
      ref={regionRef}
      role={isRegion ? 'region' : undefined}
      aria-label={isRegion ? label : undefined}
      tabIndex={isRegion ? 0 : undefined}
      onFocus={(event) => {
        if (event.target === event.currentTarget) setRegionFocused(true)
      }}
      onBlur={(event) => {
        if (event.target === event.currentTarget) setRegionFocused(false)
      }}
      className="relative max-w-full min-w-0 overflow-x-auto"
    >
      {children(contentRef)}
    </div>
  )
}

/**
 * The heading components for Markdown under a heading of `headingLevel`. HTML
 * stops at h6, so with `headingLevel` 2 the depths from `####` down all render
 * as h6. remark-gfm titles the footnotes with a visually hidden h2; that one
 * sits directly below the section heading, so the outline skips no level.
 */
function headingComponents(headingLevel: HeadingLevel) {
  const heading = (depth: number): Components['h1'] =>
    function Heading({ node: _node, className, ...props }) {
      const level = props.id?.endsWith('footnote-label') ? 1 : depth
      const Tag =
        `h${Math.min(6, headingLevel + level) as HeadingLevel}` as const
      return <Tag {...props} className={cn(className, 'font-semibold')} />
    }
  return {
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    h5: heading(5),
    h6: heading(6),
  } satisfies Components
}

const components: Components = {
  // The default urlTransform keeps http, https, irc, ircs, mailto and xmpp URLs
  // and empties any other scheme, javascript: included, so such a link is shown
  // as its text and never becomes a link.
  a({ node: _node, href, children, ...props }) {
    if (!href) return <span>{children}</span>
    return (
      <a {...props} href={href} className="underline underline-offset-4">
        {children}
      </a>
    )
  },
  // A GFM task list item. A disabled checkbox reads as a form control the user
  // cannot use, so its state is text instead.
  input({ node: _node, type, checked }) {
    if (type !== 'checkbox') return null
    return (
      <>
        <span aria-hidden="true" className="font-mono">
          {checked ? '[x]' : '[ ]'}
        </span>
        <span className="sr-only">{checked ? 'done' : 'not done'}</span>{' '}
      </>
    )
  },
  // A loose list's items are paragraphs, so they get paragraph spacing too.
  ul({ node: _node, className, ...props }) {
    return (
      <ul
        {...props}
        className={cn(
          'flex list-disc flex-col gap-1 pl-6 has-[>li>p]:gap-10',
          className?.includes('contains-task-list') && 'list-none pl-0',
        )}
      />
    )
  },
  ol({ node: _node, className: _className, ...props }) {
    return (
      <ol
        {...props}
        className="flex list-decimal flex-col gap-1 pl-6 has-[>li>p]:gap-10"
      />
    )
  },
  // A loose list item holds paragraphs; space them like the ones outside.
  li({ node: _node, ...props }) {
    return <li {...props} className="[&>p+*]:mt-10" />
  },
  blockquote({ node: _node, ...props }) {
    return (
      <blockquote
        {...props}
        className="flex flex-col gap-10 border-l-2 border-border pl-3"
      />
    )
  },
  // Inline code. Inside a pre the pre's classes clear the background and
  // padding.
  code({ node: _node, className, ...props }) {
    return (
      <code
        {...props}
        className={cn(
          'rounded bg-muted px-1 font-mono text-foreground',
          className,
        )}
      />
    )
  },
  pre({ node: _node, ...props }) {
    return (
      <ScrollableBlock label="Code block">
        {(contentRef) => (
          <pre
            {...props}
            ref={contentRef as RefObject<HTMLPreElement | null>}
            className="w-max min-w-full rounded-md border border-border bg-muted p-3 text-sm leading-relaxed whitespace-pre [&>code]:bg-transparent [&>code]:p-0"
          />
        )}
      </ScrollableBlock>
    )
  },
  table({ node: _node, ...props }) {
    return (
      <ScrollableBlock label="Table">
        {(contentRef) => (
          <table
            {...props}
            ref={contentRef as RefObject<HTMLTableElement | null>}
            className="border-collapse"
          />
        )}
      </ScrollableBlock>
    )
  },
  th({ node: _node, ...props }) {
    return (
      <th
        {...props}
        className="border border-border px-2 py-1 text-left align-top font-semibold break-words"
      />
    )
  },
  td({ node: _node, ...props }) {
    return (
      <td
        {...props}
        className="border border-border px-2 py-1 text-left align-top break-words"
      />
    )
  },
  hr({ node: _node, ...props }) {
    return <hr {...props} className="border-border" />
  },
}

// Built once per level, so a render does not remount every heading.
const COMPONENTS_BY_LEVEL = ([1, 2, 3, 4, 5, 6] as const).map(
  (level): Components => ({ ...headingComponents(level), ...components }),
)

/**
 * Markdown from a task description, with GitHub tables, strikethrough and task
 * lists. There is no rehype-raw, so raw HTML in the source is shown as text,
 * and unsafe link URLs are dropped. Headings start one level below
 * `headingLevel`, the heading of the section the Markdown sits in. For 1.4.8,
 * lines are capped at max-w-prose (65ch, under 80 characters), line height is
 * 1.625, and blocks sit 40 px apart, over 1.5 times the 26 px line height, as
 * on the Help page.
 */
export function Markdown({
  children,
  headingLevel,
}: {
  children: string
  headingLevel: HeadingLevel
}) {
  return (
    <div className="flex max-w-prose min-w-0 flex-col gap-10 leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={COMPONENTS_BY_LEVEL[headingLevel - 1]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
