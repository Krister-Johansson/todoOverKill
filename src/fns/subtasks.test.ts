// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { subtasksQueryOptions } from '#/fns/subtasks'
import { taskActivityQueryOptions, taskQueryOptions } from '#/fns/tasks'

describe('subtasksQueryOptions', () => {
  it("sits under the task's key, beside the activity log's", () => {
    const taskKey = taskQueryOptions('t1').queryKey
    const subtasksKey = subtasksQueryOptions('t1').queryKey

    expect(subtasksKey.slice(0, taskKey.length)).toEqual([...taskKey])
    expect(subtasksKey).toEqual(['tasks', 't1', 'subtasks'])
    expect(subtasksKey).not.toEqual(taskActivityQueryOptions('t1').queryKey)
  })

  it("is invalidated with the task, as the Move menu's onSettled does it", async () => {
    const queryClient = new QueryClient()
    const subtasksKey = subtasksQueryOptions('t1').queryKey
    queryClient.setQueryData(subtasksKey, [])

    await queryClient.invalidateQueries({
      queryKey: taskQueryOptions('t1').queryKey,
    })

    expect(queryClient.getQueryState(subtasksKey)?.isInvalidated).toBe(true)
  })
})
