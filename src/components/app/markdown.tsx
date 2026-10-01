import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '#/lib/utils'

import type { Components } from 'react-markdown'
import type { ReactNode, RefObject } from 'react'

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

/**
 * Whether the region is wider inside than out. It watches the region and its
 * content, so a resize or a zoom change updates it. False on the server and
 * until the first measurement. The same hook as the board route's; F22 moves
 * it to src/hooks/use-overflows-x.ts, and this copy goes once that lands.
 */
function useOverflowsX(
  regionRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
) {
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const region = regionRef.current
    const content = contentRef.current
    if (!region || !content) return
    const measure = () => setOverflows(region.scrollWidth > region.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(region)
    observer.observe(content)
    return () => observer.disconnect()
  }, [regionRef, contentRef])

  return overflows
}

/**
 * A code block or table that scrolls sideways inside itself, never the page
 * (1.4.10). Like the board, the region is a Tab stop only while it overflows,
 * or while it holds focus, so keyboard users can scroll it and meet no extra
 * stop otherwise.
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

  return (
    <div
      ref={regionRef}
      role="region"
      aria-label={label}
      tabIndex={scrollable || regionFocused ? 0 : undefined}
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

/** The heading components for Markdown under a heading of `headingLevel`. */
function headingComponents(headingLevel: HeadingLevel) {
  const heading = (depth: number): Components['h1'] =>
    function Heading({ node: _node, ...props }) {
      const Tag =
        `h${Math.min(6, headingLevel + depth) as HeadingLevel}` as const
      return <Tag {...props} className="font-semibold break-words" />
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
  // The default urlTransform empties a javascript:, vbscript: or data: URL, so
  // such a link is shown as its text and never becomes a link.
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
  ul({ node: _node, className, ...props }) {
    return (
      <ul
        {...props}
        className={cn(
          'flex list-disc flex-col gap-1 pl-6',
          className?.includes('contains-task-list') && 'list-none pl-0',
        )}
      />
    )
  },
  ol({ node: _node, className: _className, ...props }) {
    return <ol {...props} className="flex list-decimal flex-col gap-1 pl-6" />
  },
  blockquote({ node: _node, ...props }) {
    return <blockquote {...props} className="border-l-2 border-border pl-3" />
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
            className="w-max min-w-full rounded-md border border-border bg-muted p-3 text-sm whitespace-pre [&>code]:bg-transparent [&>code]:p-0"
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
 * `headingLevel`, the heading of the section the Markdown sits in. Lines are
 * capped at max-w-prose (65ch, under 80 characters) with relaxed spacing
 * (1.4.8).
 */
export function Markdown({
  children,
  headingLevel,
}: {
  children: string
  headingLevel: HeadingLevel
}) {
  return (
    <div className="flex max-w-prose min-w-0 flex-col gap-4 leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={COMPONENTS_BY_LEVEL[headingLevel - 1]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
