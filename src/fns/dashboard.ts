import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import * as z from 'zod'

import { dueDateSchema } from '#/schemas/task'
import {
  listDashboardTasks,
  listProjectProgress,
  listRecentActivity,
} from '#/server/dashboard'

/** The tasks due on `today` and the overdue ones, across unarchived projects. */
export const listDashboardTasksFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ today: dueDateSchema }))
  .handler(({ data }) => listDashboardTasks(data.today))

/** The key every dashboard query starts with. */
export const DASHBOARD_QUERY_KEY = ['dashboard'] as const

/** The dashboard's tasks for `today`, for the loader and the page alike. */
export function dashboardQueryOptions(today: string) {
  return queryOptions({
    queryKey: [...DASHBOARD_QUERY_KEY, today],
    queryFn: () => listDashboardTasksFn({ data: { today } }),
  })
}

/** The latest activity rows across unarchived projects, newest first. */
export const listRecentActivityFn = createServerFn({ method: 'GET' }).handler(
  () => listRecentActivity(),
)

/** Every unarchived project with its task and completed task counts. */
export const listProjectProgressFn = createServerFn({ method: 'GET' }).handler(
  () => listProjectProgress(),
)

/** The dashboard's recent activity, for the loader and the page alike. */
export function recentActivityQueryOptions() {
  return queryOptions({
    queryKey: [...DASHBOARD_QUERY_KEY, 'activity'],
    queryFn: () => listRecentActivityFn(),
  })
}

/** The dashboard's project progress, for the loader and the page alike. */
export function projectProgressQueryOptions() {
  return queryOptions({
    queryKey: [...DASHBOARD_QUERY_KEY, 'progress'],
    queryFn: () => listProjectProgressFn(),
  })
}
