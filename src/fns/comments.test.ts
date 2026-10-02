// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { commentsQueryOptions } from '#/fns/comments'
import { subtasksQueryOptions } from '#/fns/subtasks'
import { taskActivityQueryOptions, taskQueryOptions } from '#/fns/tasks'

describe('commentsQueryOptions', () => {
  it("sits under the task's key, beside the activity log's and the subtasks'", () => {
    const taskKey = taskQueryOptions('t1').queryKey
    const commentsKey = commentsQueryOptions('t1').queryKey

    expect(commentsKey.slice(0, taskKey.length)).toEqual([...taskKey])
    expect(commentsKey).toEqual(['tasks', 't1', 'comments'])
    expect(commentsKey).not.toEqual(taskActivityQueryOptions('t1').queryKey)
    expect(commentsKey).not.toEqual(subtasksQueryOptions('t1').queryKey)
  })

  it("is invalidated with the task, as the Move menu's onSettled does it", async () => {
    const queryClient = new QueryClient()
    const commentsKey = commentsQueryOptions('t1').queryKey
    queryClient.setQueryData(commentsKey, [])

    await queryClient.invalidateQueries({
      queryKey: taskQueryOptions('t1').queryKey,
    })

    expect(queryClient.getQueryState(commentsKey)?.isInvalidated).toBe(true)
  })
})
