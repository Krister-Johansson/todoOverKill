import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  CircleHelp,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Plus,
  Search,
  Settings,
  SunMoon,
} from 'lucide-react'
import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Kbd, KbdGroup } from '#/components/ui/kbd'
import { Label } from '#/components/ui/label'
import { projectsQueryOptions } from '#/fns/projects'
import {
  MAX_SEARCH_LENGTH,
  MIN_SEARCH_LENGTH,
  searchQueryOptions,
} from '#/fns/search'
import { useTheme } from '#/hooks/use-theme'
import { isCommandPaletteShortcut } from '#/lib/keyboard'

import { useAnnounce } from './live-region'
import { Pause } from './task-card'

import type { listProjectsFn } from '#/fns/projects'
import type { searchFn } from '#/fns/search'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// What an option does. Navigation starts at once; the rest waits until the
// palette has closed, so focus has somewhere to go (see onCloseAutoFocus).
type Run =
  | { kind: 'navigate'; go: () => Promise<void> }
  | { kind: 'new-task' }
  | { kind: 'theme'; theme: 'light' | 'dark' }

type Group = 'actions' | 'projects' | 'tasks'

/**
 * An action, or a search result. `label` is what the actions filter matches;
 * `content`, when set, is shown instead of it.
 */
type Option = {
  id: string
  group: Group
  label: string
  content?: ReactNode
  icon: LucideIcon
  run: Run
}

type SearchResults = Awaited<ReturnType<typeof searchFn>>

const groups = [
  { group: 'actions', caption: 'Actions' },
  { group: 'projects', caption: 'Projects' },
  { group: 'tasks', caption: 'Tasks' },
] as const satisfies Array<{ group: Group; caption: string }>

// Long enough that typing a word announces the count once, at the end. The
// search waits as long after the last key press.
const ANNOUNCE_DELAY = 250

const SEARCH_FAILED = 'Search failed. Try again.'

const themeNames = { light: 'Light', dark: 'Dark' } as const

// One array for "no projects yet", so the actions memo is not rebuilt on
// every render while the query has no data.
const NO_PROJECTS: Awaited<ReturnType<typeof listProjectsFn>> = []

function matching(actions: Array<Option>, text: string) {
  const query = text.trim().toLowerCase()
  if (!query) return actions
  return actions.filter((action) => action.label.toLowerCase().includes(query))
}

function countMessage(count: number) {
  if (count === 0) return 'No results'
  return count === 1 ? '1 option' : `${count} options`
}

/**
 * The search results as options, projects before tasks, each in the order
 * the service ranks them. A row that comes back twice is listed once, so no
 * two options share an id.
 */
function resultOptions(
  results: SearchResults,
  navigate: ReturnType<typeof useNavigate>,
) {
  const seen = new Set<string>()
  const options: Array<Option> = []
  const add = (option: Option) => {
    if (seen.has(option.id)) return
    seen.add(option.id)
    options.push(option)
  }
  for (const project of results.projects) {
    add({
      id: `result-project-${project.id}`,
      group: 'projects',
      label: `${project.name} ${project.key}`,
      content: (
        <>
          <span className="min-w-0 break-words">{project.name}</span>
          <Pause />
          <span className="text-muted-foreground group-aria-selected:text-primary-foreground">
            {project.key}
          </span>
        </>
      ),
      icon: FolderKanban,
      run: {
        kind: 'navigate',
        go: () =>
          navigate({
            to: '/projects/$projectId/board',
            params: { projectId: project.id },
          }),
      },
    })
  }
  for (const task of results.tasks) {
    const reference = `${task.project.key}-${task.number}`
    add({
      id: `result-task-${task.id}`,
      group: 'tasks',
      label: `${reference} ${task.title} ${task.project.name}`,
      content: (
        <>
          <span className="text-muted-foreground group-aria-selected:text-primary-foreground">
            {reference}
          </span>
          <Pause />
          <span className="min-w-0 break-words">{task.title}</span>
          <Pause />
          <span className="min-w-0 break-words text-muted-foreground group-aria-selected:text-primary-foreground">
            {task.project.name}
          </span>
        </>
      ),
      icon: ListTodo,
      run: {
        kind: 'navigate',
        go: () =>
          navigate({ to: '/tasks/$taskId', params: { taskId: task.id } }),
      },
    })
  }
  return options
}

/**
 * The command palette: the top bar's Search button, and Ctrl+K or ⌘+K from
 * anywhere (isCommandPaletteShortcut), open a dialog with a combobox that
 * filters a listbox of actions and, from two characters on, lists matching
 * projects and tasks below them. New task is listed only when the top bar
 * passes `openCreateTask`, on a project route. Escape returns focus to the
 * element that opened the palette, or to the Search button when that element
 * is gone. A navigation sends focus to the main landmark, New task to the
 * dialog it opens, and Switch theme back to the opener (2.4.3).
 */
export function CommandPalette({
  openCreateTask,
}: {
  openCreateTask?: () => void
}) {
  const announce = useAnnounce()
  const { setTheme } = useTheme()
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Radix returns focus to the trigger, but Ctrl+K may come from anywhere.
  const opener = useRef<HTMLElement | null>(null)
  const chosen = useRef<Run | null>(null)
  const [open, setOpen] = useState(false)

  function handleOpenChange(next: boolean) {
    if (next) {
      const active = document.activeElement
      opener.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null
      chosen.current = null
    }
    setOpen(next)
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    // Only a key press that opens the palette loses its default. While another
    // dialog or the palette itself is open, the key keeps it, so on a Mac
    // Ctrl+K in a text field still deletes to the end of the line.
    if (!isCommandPaletteShortcut(event)) return
    event.preventDefault()
    handleOpenChange(true)
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  function focusOpener() {
    const target = opener.current
    opener.current = null
    if (target?.isConnected) target.focus()
    // A hidden or disabled opener does not take focus.
    if (document.activeElement !== target) triggerRef.current?.focus()
  }

  function run(next: Run) {
    // The first activation wins. A second Enter or click must not run the
    // same action again or replace it with another.
    if (!open || chosen.current) return
    chosen.current = next
    // A loader that fails, such as notFound for a project deleted in another
    // tab, renders the route's error component; the promise still resolves.
    if (next.kind === 'navigate') void next.go()
    if (next.kind === 'theme') setTheme(next.theme)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search aria-hidden="true" />
          Search
          {/* The shortcut is in aria-keyshortcuts; Ctrl+K works on a Mac
              too. */}
          <KbdGroup aria-hidden="true" className="hidden sm:inline-flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
      </DialogTrigger>
      {/* No exit animation, so the palette unmounts as soon as it closes and
          the chosen action never waits on animationend. The important
          modifier is needed: tailwind-merge keeps DialogContent's
          animate-out, which the stylesheet puts after animate-none. */}
      <DialogContent
        className="data-[state=closed]:animate-none!"
        onCloseAutoFocus={(event) => {
          // Runs once the palette has unmounted, so its aria-hidden no longer
          // hides the shell's live region and a second dialog does not fight
          // it for focus. Focus never drops to the page.
          event.preventDefault()
          const next = chosen.current
          chosen.current = null
          if (next?.kind === 'navigate') {
            opener.current = null
            document.getElementById('main')?.focus()
            return
          }
          focusOpener()
          if (next?.kind === 'new-task') openCreateTask?.()
          if (next?.kind === 'theme') {
            announce(`Theme set to ${themeNames[next.theme]}`)
          }
        }}
      >
        <PaletteBody hasNewTask={!!openCreateTask} onRun={run} />
      </DialogContent>
    </Dialog>
  )
}

function PaletteBody({
  hasNewTask,
  onRun,
}: {
  hasNewTask: boolean
  onRun: (run: Run) => void
}) {
  const id = useId()
  const inputId = `${id}-input`
  const listboxId = `${id}-listbox`
  const optionId = (option: Option) => `${id}-option-${option.id}`
  const captionId = (group: Group) => `${id}-group-${group}`
  const navigate = useNavigate()
  const { resolved } = useTheme()
  const { data: projects = NO_PROJECTS } = useQuery(projectsQueryOptions())
  const [text, setText] = useState('')
  // The text the search runs on, ANNOUNCE_DELAY after the last change.
  const [searched, setSearched] = useState('')
  // By id rather than position, so results that arrive or change under the
  // active option leave it where it was. Null, or an id that is gone, means
  // the first option.
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [typed, setTyped] = useState(false)
  const [message, setMessage] = useState('')

  const trimmed = text.trim()
  const wantsSearch =
    trimmed.length >= MIN_SEARCH_LENGTH && trimmed.length <= MAX_SEARCH_LENGTH

  useEffect(() => {
    const timer = setTimeout(() => setSearched(trimmed), ANNOUNCE_DELAY)
    return () => clearTimeout(timer)
  }, [trimmed])

  // Each text has its own cache entry, so a slow response for older text
  // lands under that text and never shows as the newer text's results.
  const search = useQuery({
    ...searchQueryOptions(searched),
    enabled:
      wantsSearch &&
      searched.length >= MIN_SEARCH_LENGTH &&
      searched.length <= MAX_SEARCH_LENGTH,
    retry: false,
  })
  // While the debounced text lags the input, search.data answers older text.
  // A fetch counts too, so a retry after an error is not shown as a failure.
  const searching =
    wantsSearch &&
    (searched !== trimmed || search.isPending || search.isFetching)
  // A failed refetch keeps the last good answer rather than failing.
  const failed =
    wantsSearch && !searching && search.isError && search.data === undefined

  const actions = useMemo(() => {
    const opposite = resolved === 'dark' ? 'light' : 'dark'
    const list: Array<Option> = []
    if (hasNewTask) {
      list.push({
        id: 'new-task',
        group: 'actions',
        label: 'New task',
        icon: Plus,
        run: { kind: 'new-task' },
      })
    }
    list.push(
      {
        id: 'dashboard',
        group: 'actions',
        label: 'Go to Dashboard',
        icon: LayoutDashboard,
        run: { kind: 'navigate', go: () => navigate({ to: '/' }) },
      },
      {
        id: 'settings',
        group: 'actions',
        label: 'Go to Settings',
        icon: Settings,
        run: { kind: 'navigate', go: () => navigate({ to: '/settings' }) },
      },
      {
        id: 'help',
        group: 'actions',
        label: 'Go to Help',
        icon: CircleHelp,
        run: { kind: 'navigate', go: () => navigate({ to: '/help' }) },
      },
      {
        id: 'theme',
        group: 'actions',
        label: `Switch to ${opposite} theme`,
        icon: SunMoon,
        run: { kind: 'theme', theme: opposite },
      },
      // The list holds unarchived projects only, sorted by name.
      ...projects.map((project) => ({
        id: `project-${project.id}`,
        group: 'actions' as const,
        label: `Go to ${project.name}`,
        icon: FolderKanban,
        run: {
          kind: 'navigate' as const,
          go: () =>
            navigate({
              to: '/projects/$projectId/board',
              params: { projectId: project.id },
            }),
        },
      })),
    )
    return list
  }, [hasNewTask, navigate, projects, resolved])

  const results = useMemo(
    () => (search.data ? resultOptions(search.data, navigate) : []),
    [search.data, navigate],
  )

  // One flat list in screen order drives the active option and the keys;
  // the groups are only how it is drawn. Results for older text are left out
  // while the search for the current text is out, so Enter never runs one.
  const matches = [
    ...matching(actions, text),
    ...(wantsSearch && !searching && !failed ? results : []),
  ]
  const found = matches.findIndex((option) => option.id === activeKey)
  const activeIndex = found === -1 ? 0 : found
  const activeOption = matches.at(activeIndex)
  const activeId = activeOption ? optionId(activeOption) : undefined

  const count = matches.length
  // Nothing while a search is on its way, so the count read is the total of
  // actions and results, not the actions alone.
  const announcement = searching
    ? null
    : failed
      ? SEARCH_FAILED
      : countMessage(count)

  useEffect(() => {
    if (activeId) {
      document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeId])

  // Nothing is announced on open, only once the text has changed. A change to
  // the text or the message restarts the delay, so what is read matches the
  // list on screen even if the projects were refetched while typing.
  useEffect(() => {
    if (!typed || announcement === null) return
    const timer = setTimeout(() => setMessage(announcement), ANNOUNCE_DELAY)
    return () => clearTimeout(timer)
  }, [typed, text, announcement])

  function handleTextChange(next: string) {
    setText(next)
    setActiveKey(null)
    setTyped(true)
    // Cleared first, so the same count twice in a row is read again.
    setMessage('')
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Enter and the arrows belong to the input method while composing.
    // Ctrl+K needs nothing here: the window listener swallows it.
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      if (activeOption) onRun(activeOption.run)
      return
    }
    if (count === 0) return
    const moves: Partial<Record<string, number>> = {
      ArrowDown: (activeIndex + 1) % count,
      ArrowUp: (activeIndex - 1 + count) % count,
      Home: 0,
      End: count - 1,
    }
    const next = moves[event.key]
    if (next === undefined) return
    event.preventDefault()
    setActiveKey(matches[next].id)
  }

  let status: string | null = null
  if (failed) status = SEARCH_FAILED
  else if (searching) status = 'Searching…'
  else if (count === 0) status = 'No results'

  return (
    <>
      <DialogHeader>
        <DialogTitle>Command menu</DialogTitle>
        <DialogDescription>
          Type to filter the actions; from two characters on, matching projects
          and tasks are listed too. Up and down arrows pick an option, Enter
          runs it, and Escape closes the menu.
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={inputId}>Search</Label>
        <Input
          id={inputId}
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={count > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {/* Hidden rather than removed when nothing matches, so aria-controls
          always points at an element. The list scrolls inside the dialog;
          axe does not ask a combobox popup to be focusable. Each kind of
          option is a group named by its visible caption, as in the APG
          listbox with grouped options. */}
      <div
        id={listboxId}
        role="listbox"
        aria-label="Options"
        hidden={count === 0}
        className="flex max-h-[min(20rem,40dvh)] min-w-0 flex-col gap-2 overflow-y-auto"
      >
        {groups.map(({ group, caption }) => {
          const members = matches.flatMap((option, index) =>
            option.group === group ? [{ option, index }] : [],
          )
          if (members.length === 0) return null
          return (
            <div
              key={group}
              role="group"
              aria-labelledby={captionId(group)}
              className="flex min-w-0 flex-col gap-1"
            >
              <div
                id={captionId(group)}
                role="presentation"
                className="px-3 text-xs font-medium text-muted-foreground"
              >
                {caption}
              </div>
              {members.map(({ option, index }) => {
                const Icon = option.icon
                return (
                  <div
                    key={option.id}
                    id={optionId(option)}
                    role="option"
                    aria-selected={index === activeIndex}
                    className="group flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-md px-3 text-sm font-medium break-words aria-selected:bg-primary aria-selected:text-primary-foreground"
                    // The pointer moves the active option, as in the APG
                    // examples, so the highlighted option is always the one
                    // Enter runs. A move, not an enter, so scrolling under a
                    // still pointer does not take the active option from the
                    // keyboard.
                    onPointerMove={() => {
                      if (index !== activeIndex) setActiveKey(option.id)
                    }}
                    // Keeps focus in the input, where the keyboard works.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onRun(option.run)}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      {option.content ?? option.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {status ? <p className="text-sm">{status}</p> : null}
      {/* The dialog is modal, so Radix hides the rest of the page, the shell's
          live region included, with aria-hidden while it is open. The count
          is announced here instead (docs/architecture.md). */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </div>
    </>
  )
}
