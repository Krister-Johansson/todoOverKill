import { Outlet, createFileRoute, useMatches } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { AssistantPanel } from '#/components/app/assistant-panel'
import { LiveRegionProvider } from '#/components/app/live-region'
import { PreferencesProvider } from '#/components/app/preferences'
import { Sidebar } from '#/components/app/sidebar'
import { TopBar } from '#/components/app/top-bar'
import { assistantStatusQueryOptions } from '#/fns/assistant'
import { projectsQueryOptions } from '#/fns/projects'
import { useHotkeys } from '#/hooks/use-hotkeys'
import { cn } from '#/lib/utils'

import type { AssistantPanelHandle } from '#/components/app/assistant-panel'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** The page name, shown as the current breadcrumb item. */
    title?: string
  }
}

export const Route = createFileRoute('/_app')({
  // Fills the sidebar's project list on the server, so it is in the first
  // paint. The sidebar reads the same query, and a create updates its cache.
  // The assistant's status (key set or not) is read here too, so the panel
  // never suspends when it opens.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(projectsQueryOptions()),
      context.queryClient.ensureQueryData(assistantStatusQueryOptions()),
    ]),
  component: AppShell,
})

/**
 * The single-key shortcut `a` (through useHotkeys, so it obeys the shortcuts
 * setting and does nothing while typing in a field) opens the assistant
 * panel, or moves focus to its Message field when it is already open.
 */
function useAssistantPanel() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<AssistantPanelHandle>(null)

  useHotkeys({
    a: () => {
      if (open) panelRef.current?.focusComposer()
      else setOpen(true)
    },
  })

  return { open, setOpen, buttonRef, panelRef }
}

function AppShell() {
  // The deepest route that names itself is the current page.
  const title =
    useMatches({
      select: (matches) =>
        matches
          .map((match) => match.staticData.title)
          .filter(Boolean)
          .at(-1),
    }) ?? 'todoOverKill'
  const assistant = useAssistantPanel()

  return (
    <LiveRegionProvider>
      <PreferencesProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-background focus:px-4 focus:text-foreground"
        >
          Skip to content
        </a>
        {/* While the panel is open the shell leaves room for it from md up,
            so nothing is under it (2.4.11). Below md the panel fills the
            viewport and the shell is hidden, so no focused element can sit
            behind it; the panel returns focus once the shell is back. */}
        <div
          className={cn(
            'grid min-h-dvh grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)]',
            assistant.open && 'max-md:hidden md:mr-80 lg:mr-96',
          )}
        >
          <Sidebar />
          <div className="flex min-w-0 flex-col">
            <TopBar
              currentPage={title}
              assistantOpen={assistant.open}
              onAssistantToggle={() => assistant.setOpen((open) => !open)}
              assistantButtonRef={assistant.buttonRef}
            />
            <main
              id="main"
              tabIndex={-1}
              aria-label="Content"
              className="flex-1 p-4 md:p-6"
            >
              <Outlet />
            </main>
          </div>
        </div>
        <AssistantPanel
          ref={assistant.panelRef}
          open={assistant.open}
          onOpenChange={assistant.setOpen}
          returnFocusTo={assistant.buttonRef}
        />
      </PreferencesProvider>
    </LiveRegionProvider>
  )
}
