import { Outlet, createFileRoute, useMatches } from '@tanstack/react-router'

import { LiveRegionProvider } from '#/components/app/live-region'
import { PreferencesProvider } from '#/components/app/preferences'
import { Sidebar } from '#/components/app/sidebar'
import { TopBar } from '#/components/app/top-bar'
import { projectsQueryOptions } from '#/fns/projects'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** The page name, shown as the current breadcrumb item. */
    title?: string
  }
}

export const Route = createFileRoute('/_app')({
  // Fills the sidebar's project list on the server, so it is in the first
  // paint. The sidebar reads the same query, and a create updates its cache.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(projectsQueryOptions()),
  component: AppShell,
})

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

  return (
    <LiveRegionProvider>
      <PreferencesProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-background focus:px-4 focus:text-foreground"
        >
          Skip to content
        </a>
        <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)]">
          <Sidebar />
          <div className="flex min-w-0 flex-col">
            <TopBar currentPage={title} />
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
      </PreferencesProvider>
    </LiveRegionProvider>
  )
}
