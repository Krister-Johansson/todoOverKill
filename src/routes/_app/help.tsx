import { Link, createFileRoute } from '@tanstack/react-router'

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

const sections = [
  { id: 'glossary', label: 'Glossary' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'browsers', label: 'Browser support' },
] as const

type SectionId = (typeof sections)[number]['id']

// Each term has an id, so other pages can link to its definition (3.1.3).
const terms: Array<{ id: string; term: string; definition: string }> = [
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
    definition:
      'How urgent a task is: None, Low, Medium, High or Urgent. The app shows it as a word and an icon.',
  },
  {
    id: 'due-date',
    term: 'Due date',
    definition:
      'The day a task should be done by. A task past its due date is marked Overdue.',
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
    definition:
      'The start page. It shows what is due today, what is late and what changed lately.',
  },
  {
    id: 'assistant',
    term: 'Assistant',
    definition:
      'A chat panel that answers questions about your work and can make changes for you. It asks you first before it deletes anything.',
  },
  {
    id: 'voice',
    term: 'Voice',
    definition:
      'Talking to the assistant instead of typing. It works only in Chrome.',
  },
  {
    id: 'mcp',
    term: 'MCP',
    definition:
      'Model Context Protocol. A common way for AI tools, such as Claude Code, to read and change your tasks.',
  },
  {
    id: 'webmcp',
    term: 'WebMCP',
    definition:
      'A way for an AI agent built into the browser to use this page, for example to open a task. It works only in Chrome.',
  },
  {
    id: 'rest-api',
    term: 'REST API',
    definition:
      'Web addresses that other programs can call to read and change your projects and tasks.',
  },
]

const shortcuts: Array<{ keys: Array<string>; action: string; later?: true }> =
  [
    { keys: ['Tab'], action: 'Go to the next link, button or field.' },
    { keys: ['Shift', 'Tab'], action: 'Go back to the one before.' },
    { keys: ['Enter'], action: 'Follow a link or press a button.' },
    { keys: ['Space'], action: 'Press a button or turn a switch on or off.' },
    { keys: ['Escape'], action: 'Close a dialog.' },
    {
      keys: ['↑', '↓', '←', '→'],
      action: 'Pick an option in a group, such as Theme in Settings.',
    },
    {
      keys: ['Tab', 'Enter'],
      action:
        'On a new page, the first Tab shows "Skip to content". Enter then jumps past the menu to the page.',
    },
    { keys: ['c'], action: 'Make a new task.', later: true },
    {
      keys: ['Ctrl', 'K'],
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
      <div className="flex max-w-prose flex-col gap-6 leading-relaxed">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p>
          This page explains the words the app uses, the keys you can press, and
          which browsers can use voice and WebMCP.
        </p>
        <nav aria-label="On this page">
          <ul className="flex flex-col">
            {sections.map(({ id, label }) => (
              <li key={id}>
                <Link
                  to="/help"
                  hash={id}
                  // The router scrolls to the section; focus goes there too,
                  // so the next Tab continues from it.
                  onClick={() => document.getElementById(id)?.focus()}
                  className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <HelpSection id="glossary">
        <p>The words below have a special meaning in this app.</p>
        <dl className="flex flex-col gap-6">
          {terms.map(({ id, term, definition }) => (
            <div key={id} className="flex flex-col gap-1">
              <dt id={id} className="font-semibold">
                {term}
              </dt>
              <dd>{definition}</dd>
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
            {shortcuts.map(({ keys, action, later }) => (
              <TableRow key={`${keys.join('+')} ${action}`}>
                <TableCell className="align-top">
                  <KbdGroup>
                    {keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </KbdGroup>
                </TableCell>
                <TableCell className="align-top">
                  {action}
                  {later ? (
                    <span className="block font-medium">{laterNote}</span>
                  ) : null}
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

/**
 * A labelled region with an id the contents links point to. It takes focus
 * from those links, so it has tabIndex -1.
 */
function HelpSection({ id, children }: { id: SectionId; children: ReactNode }) {
  const label = sections.find((section) => section.id === id)?.label
  const headingId = `help-${id}`

  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="flex max-w-prose scroll-mt-4 flex-col gap-4 leading-relaxed"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {label}
      </h2>
      {/* 1.4.8: paragraph spacing is at least 1.5 times the line height. */}
      <div className="flex flex-col gap-10">{children}</div>
    </section>
  )
}
