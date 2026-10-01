// @vitest-environment node
// Server code runs without `window`. Under jsdom, t3-env treats the module as
// client code and blocks every server variable.
import { describe, expect, it } from 'vitest'

import { labelsQueryOptions } from '#/fns/labels'
import { projectQueryOptions } from '#/fns/projects'

describe('labelsQueryOptions', () => {
  it('keys the labels under their project', () => {
    const { queryKey } = labelsQueryOptions('p1')

    expect(queryKey).toEqual(['projects', 'p1', 'labels'])
    expect(queryKey.slice(0, 2)).toEqual(projectQueryOptions('p1').queryKey)
  })

  it('gives each project its own key', () => {
    expect(labelsQueryOptions('p1').queryKey).not.toEqual(
      labelsQueryOptions('p2').queryKey,
    )
  })
})
