import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  CircleHelp,
  FolderKanban,
  LayoutDashboard,
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
import { useTheme } from '#/hooks/use-theme'
import { isCommandPaletteShortcut } from '#/lib/keyboard'

import { useAnnounce } from './live-region'

import type { listProjectsFn } from '#/fns/projects'
import type { LucideIcon } from 'lucide-react'

// What an action does. Navigation starts at once; the rest waits until the
// palette has closed, so focus has somewhere to go (see onCloseAutoFocus).
type Run =
  | { kind: 'navigate'; go: () => Promise<void> }
  | { kind: 'new-task' }
  | { kind: 'theme'; theme: 'light' | 'dark' }

type Action = { id: string; label: string; icon: LucideIcon; run: Run }

// Long enough that typing a word announces the count once, at the end.
const ANNOUNCE_DELAY = 250

const themeNames = { light: 'Light', dark: 'Dark' } as const

// One array for "no projects yet", so the actions memo is not rebuilt on
// every render while the query has no data.
const NO_PROJECTS: Awaited<ReturnType<typeof listProjectsFn>> = []

function matching(actions: Array<Action>, text: string) {
  const query = text.trim().toLowerCase()
  if (!query) return actions
  return actions.filter((action) => action.label.toLowerCase().includes(query))
}

function countMessage(count: number) {
  if (count === 0) return 'No results'
  return count === 1 ? '1 option' : `${count} options`
}

/**
 * The command palette: the top bar's Search button, and Ctrl+K or ⌘+K from
 * anywhere (isCommandPaletteShortcut), open a dialog with a combobox that
 * filters a listbox of actions. New task is listed only when the top bar
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
  const optionId = (action: Action) => `${id}-option-${action.id}`
  const navigate = useNavigate()
  const { resolved } = useTheme()
  const { data: projects = NO_PROJECTS } = useQuery(projectsQueryOptions())
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const [typed, setTyped] = useState(false)
  const [message, setMessage] = useState('')

  const actions = useMemo(() => {
    const opposite = resolved === 'dark' ? 'light' : 'dark'
    const list: Array<Action> = []
    if (hasNewTask) {
      list.push({
        id: 'new-task',
        label: 'New task',
        icon: Plus,
        run: { kind: 'new-task' },
      })
    }
    list.push(
      {
        id: 'dashboard',
        label: 'Go to Dashboard',
        icon: LayoutDashboard,
        run: { kind: 'navigate', go: () => navigate({ to: '/' }) },
      },
      {
        id: 'settings',
        label: 'Go to Settings',
        icon: Settings,
        run: { kind: 'navigate', go: () => navigate({ to: '/settings' }) },
      },
      {
        id: 'help',
        label: 'Go to Help',
        icon: CircleHelp,
        run: { kind: 'navigate', go: () => navigate({ to: '/help' }) },
      },
      {
        id: 'theme',
        label: `Switch to ${opposite} theme`,
        icon: SunMoon,
        run: { kind: 'theme', theme: opposite },
      },
      // The list holds unarchived projects only, sorted by name.
      ...projects.map((project) => ({
        id: `project-${project.id}`,
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

  const matches = matching(actions, text)
  // A refetch can shorten the list under the active option.
  const activeIndex = Math.min(active, matches.length - 1)
  const activeAction = matches.at(activeIndex)
  const activeId = activeAction ? optionId(activeAction) : undefined

  const count = matches.length

  useEffect(() => {
    if (activeId) {
      document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeId])

  // Nothing is announced on open, only once the text has changed. A change to
  // the text or the count restarts the delay, so what is read matches the
  // list on screen even if the projects were refetched while typing.
  useEffect(() => {
    if (!typed) return
    const timer = setTimeout(
      () => setMessage(countMessage(count)),
      ANNOUNCE_DELAY,
    )
    return () => clearTimeout(timer)
  }, [typed, text, count])

  function handleTextChange(next: string) {
    setText(next)
    setActive(0)
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
      if (activeAction) onRun(activeAction.run)
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
    setActive(next)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Command menu</DialogTitle>
        <DialogDescription>
          Type to filter the actions. Up and down arrows pick one, Enter runs
          it, and Escape closes the menu.
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
          aria-expanded={matches.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {/* Hidden rather than removed when nothing matches, so aria-controls
          always points at an element. The list scrolls inside the dialog;
          axe does not ask a combobox popup to be focusable. */}
      <ul
        id={listboxId}
        role="listbox"
        aria-label="Actions"
        hidden={matches.length === 0}
        className="flex max-h-[min(20rem,40dvh)] min-w-0 flex-col gap-1 overflow-y-auto"
      >
        {matches.map((action, index) => {
          const Icon = action.icon
          return (
            <li
              key={action.id}
              id={optionId(action)}
              role="option"
              aria-selected={index === activeIndex}
              className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-md px-3 text-sm font-medium break-words aria-selected:bg-primary aria-selected:text-primary-foreground"
              // The pointer moves the active option, as in the APG examples,
              // so the highlighted option is always the one Enter runs. A
              // move, not an enter, so scrolling under a still pointer does
              // not take the active option from the keyboard.
              onPointerMove={() => {
                if (index !== activeIndex) setActive(index)
              }}
              // Keeps focus in the input, where the keyboard works.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onRun(action.run)}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0">{action.label}</span>
            </li>
          )
        })}
      </ul>
      {matches.length === 0 ? <p className="text-sm">No results</p> : null}
      {/* The dialog is modal, so Radix hides the rest of the page, the shell's
          live region included, with aria-hidden while it is open. The count
          is announced here instead (docs/architecture.md). */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </div>
    </>
  )
}
