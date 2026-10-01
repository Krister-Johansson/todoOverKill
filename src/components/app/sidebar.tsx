import { Link } from '@tanstack/react-router'
import { CircleHelp, LayoutDashboard, Settings } from 'lucide-react'

import type { LinkProps } from '@tanstack/react-router'

const linkClass =
  'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-primary aria-[current=page]:text-sidebar-primary-foreground'

const items: Array<{
  to: LinkProps['to']
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
}> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Help', icon: CircleHelp },
]

/**
 * The main navigation. The Projects label is a paragraph rather than a
 * heading, so the page's h1 stays the first heading in the document.
 */
export function Sidebar() {
  return (
    <nav
      aria-label="Main"
      className="flex flex-col gap-6 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:border-r"
    >
      <Link
        to="/"
        className="flex min-h-11 items-center rounded-md px-3 text-lg font-semibold"
      >
        todoOverKill
      </Link>
      <div className="flex flex-col gap-2">
        <p
          id="sidebar-projects-label"
          className="px-3 text-sm font-semibold text-muted-foreground"
        >
          Projects
        </p>
        {/* F10 fills this list with the project links. */}
        <ul aria-labelledby="sidebar-projects-label" />
        <p className="px-3 text-sm">No projects yet</p>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon, exact }) => (
          <li key={label}>
            <Link to={to} activeOptions={{ exact }} className={linkClass}>
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
