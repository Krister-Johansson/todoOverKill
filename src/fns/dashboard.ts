import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import * as z from 'zod'

import { dueDateSchema } from '#/schemas/task'
import { listDashboardTasks } from '#/server/dashboard'

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
