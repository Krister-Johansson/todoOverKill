import { Link, createFileRoute } from '@tanstack/react-router'
import { Fragment } from 'react'

import { Kbd, KbdGroup } from '#/components/ui/kbd'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'

import type { ReactNode } from 'react'

const title = 'Help'

const laterNote = 'Not available yet. Arrives in a later release.'

// Keyed by the id each contents link points to; the value is the heading.
const sections = {
  glossary: 'Glossary',
  shortcuts: 'Keyboard shortcuts',
  browsers: 'Browser support',
} as const

type SectionId = keyof typeof sections

// Each term's dt gets the id `term-<id>`, so other pages can link to its
// definition (3.1.3). Terms for features that have not shipped carry the
// same later note as the shortcuts table.
const terms: Array<{
  id: string
  term: string
  definition: string
  later?: true
}> = [
  {
    id: 'project',
    term: 'Project',
    definition:
      'A place for one area of your work. Each project has its own tasks.',
  },
  {
    id: 'key',
    term: 'Key',
    definition:
      'A short code for a project, such as TOK. Task numbers start with it, as in TOK-12.',
  },
  {
    id: 'board',
    term: 'Board',
    definition:
      "A view of a project's tasks in columns. Each column is one status.",
    later: true,
  },
  {
    id: 'status',
    term: 'Status',
    definition:
      'The stage a task is in, such as Todo, In progress or Done. You move a task to a new status as the work goes on.',
  },
  {
    id: 'backlog',
    term: 'Backlog',
    definition:
      'The first status in a new project. It holds the tasks you have not started yet.',
  },
  {
    id: 'task',
    term: 'Task',
    definition:
      'One piece of work. It has a title, and it can have a description, a due date and more.',
  },
  {
    id: 'priority',
    term: 'Priority',
    definition: 'How urgent a task is: None, Low, Medium, High or Urgent.',
  },
  {
    id: 'due-date',
    term: 'Due date',
    definition:
      'The day a task should be done by. A task is late once that day has passed.',
  },
  {
    id: 'label',
    term: 'Label',
    definition:
      'A short tag, such as "bug", that groups tasks. A task can have more than one.',
  },
  {
    id: 'subtask',
    term: 'Subtask',
    definition: 'A small step inside a task. You tick it off when it is done.',
  },
  {
    id: 'comment',
    term: 'Comment',
    definition: 'A note you add to a task.',
  },
  {
    id: 'activity',
    term: 'Activity',
    definition:
      'The record of what changed in a task and when, such as a move to Done.',
  },
  {
    id: 'dashboard',
    term: 'Dashboard',
    definition: 'The first page you see when you open the app.',
  },
  {
    id: 'assistant',
    term: 'Assistant',
    definition:
      'A chat panel where you ask about your work in plain words. It can also make changes for you.',
    later: true,
  },
  {
    id: 'voice',
    term: 'Voice',
    definition:
      'Talking to the assistant instead of typing. It works only in Chrome.',
    later: true,
  },
  {
    id: 'mcp',
    term: 'MCP',
    definition:
      'Model Context Protocol. A common way for AI tools, such as Claude Code, to read and change your tasks.',
    later: true,
  },
  {
    id: 'webmcp',
    term: 'WebMCP',
    definition:
      'A way for an AI agent built into the browser to use this page, for example to open a task. It works only in Chrome.',
    later: true,
  },
  {
    id: 'rest-api',
    term: 'REST API',
    definition:
      'Web addresses that other programs can call to read and change your projects and tasks.',
    later: true,
  },
]

// How the keys of one row are pressed: held together (combo), one after the
// other (sequence), or any one of them (any). A row with one key has no kind.
type Shortcut = {
  keys: Array<string>
  kind?: 'combo' | 'sequence' | 'any'
  action: string
  later?: true
}

const shortcuts: Array<Shortcut> = [
  { keys: ['Tab'], action: 'Go to the next link, button or field.' },
  {
    keys: ['Shift', 'Tab'],
    kind: 'combo',
    action: 'Go back to the one before.',
  },
  { keys: ['Enter'], action: 'Follow a link or press a button.' },
  { keys: ['Space'], action: 'Press a button or turn a switch on or off.' },
  { keys: ['Escape'], action: 'Close a dialog.' },
  {
    keys: ['↑', '↓', '←', '→'],
    kind: 'any',
    action: 'Pick an option in a group, such as Theme in Settings.',
  },
  {
    keys: ['Tab', 'Enter'],
    kind: 'sequence',
    action:
      'On a new page, the first Tab shows "Skip to content". Enter then jumps past the menu to the page.',
  },
  { keys: ['c'], action: 'Make a new task.', later: true },
  {
    keys: ['Ctrl', 'K'],
    kind: 'combo',
    action: 'Open the command menu to find a task or an action.',
    later: true,
  },
]

export const Route = createFileRoute('/_app/help')({
  staticData: { title },
  head: () => ({ meta: [{ title: `${title} · todoOverKill` }] }),
  component: HelpPage,
})

function HelpPage() {
  return (
    <div className="flex flex-col gap-10">
      {/* 1.4.8: blocks of text sit at least 1.5 line heights apart. */}
      <div className="flex max-w-prose flex-col gap-10 leading-relaxed">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p>
          This page explains the words the app uses, the keys you can press, and
          which browsers can use voice and WebMCP.
        </p>
        <nav aria-label="On this page">
          <ul className="flex flex-col">
            {Object.entries(sections).map(([id, label]) => (
              <li key={id}>
                {/* A plain fragment link, like the skip link: the browser
                    scrolls to the section and focuses it, so the next Tab
                    continues from there, and a modified click opens a new
                    tab without touching this one. */}
                <a
                  href={`#${id}`}
                  className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <HelpSection id="glossary">
        <p>The words below have a special meaning in this app.</p>
        <dl className="flex flex-col gap-10">
          {terms.map(({ id, term, definition, later }) => (
            <div key={id} className="flex flex-col gap-1">
              <dt id={`term-${id}`} className="font-semibold">
                {term}
              </dt>
              <dd>
                {definition}
                {later ? <LaterNote /> : null}
              </dd>
            </div>
          ))}
        </dl>
      </HelpSection>

      <HelpSection id="shortcuts">
        <p>
          Everything in the app works with a keyboard. These are the keys to
          know.
        </p>
        <Table>
          <TableCaption>Keys and what they do</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Keys</TableHead>
              <TableHead scope="col">What it does</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shortcuts.map((shortcut) => (
              <TableRow key={`${shortcut.keys.join('+')} ${shortcut.action}`}>
                <TableCell className="align-top">
                  <ShortcutKeys {...shortcut} />
                </TableCell>
                <TableCell className="align-top">
                  {shortcut.action}
                  {shortcut.later ? <LaterNote /> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p>
          Single-key shortcuts, such as <Kbd>c</Kbd>, work only when you are not
          typing in a field. You can turn them off in{' '}
          <Link to="/settings" className="underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      </HelpSection>

      <HelpSection id="browsers">
        <p>
          Voice and WebMCP work only in Chrome, because other browsers do not
          have the features they need. Both arrive in a later release.
        </p>
        <p>
          In other browsers, the app hides the voice and WebMCP controls. You
          can still type to the assistant, and every voice action also works
          with the keyboard.
        </p>
        <p>
          The app sends only text to the AI model, through a service called
          OpenRouter. But Chrome turns your speech into text, and it may send
          the sound of your voice to Google to do that. If you do not want this,
          type instead.
        </p>
      </HelpSection>
    </div>
  )
}

function LaterNote() {
  return <span className="block font-medium">{laterNote}</span>
}

const joiners = { combo: '+', sequence: ' then ', any: ' or ' } as const

/**
 * Draws a row's keys as key caps with a visible joiner, so a reader can tell
 * a chord (Shift+Tab) from a sequence (Tab then Enter) and from a choice
 * (↑ or ↓). Only a chord is a nested kbd, the HTML markup for a combination.
 */
function ShortcutKeys({ keys, kind }: Pick<Shortcut, 'keys' | 'kind'>) {
  const caps = keys.map((key, index) => (
    <Fragment key={key}>
      {index > 0 && kind ? <span>{joiners[kind]}</span> : null}
      <Kbd>{key}</Kbd>
    </Fragment>
  ))

  if (kind === 'combo') return <KbdGroup>{caps}</KbdGroup>
  return (
    <span className="inline-flex flex-wrap items-center gap-1">{caps}</span>
  )
}

/**
 * A labelled region with an id the contents links point to. It takes focus
 * from those links, so it has tabIndex -1.
 */
function HelpSection({ id, children }: { id: SectionId; children: ReactNode }) {
  const headingId = `help-${id}`

  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="flex max-w-prose scroll-mt-4 flex-col gap-4 leading-relaxed"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {sections[id]}
      </h2>
      {/* 1.4.8: paragraph spacing is at least 1.5 times the line height. */}
      <div className="flex flex-col gap-10">{children}</div>
    </section>
  )
}
