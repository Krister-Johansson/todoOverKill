import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Route } from '#/routes/_app/index'

afterEach(cleanup)

describe('index route', () => {
  it('renders the Dashboard heading', () => {
    const Component = Route.options.component!
    render(<Component />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Dashboard' }),
    ).toBeTruthy()
  })

  it('names itself Dashboard for the breadcrumb', () => {
    expect(Route.options.staticData?.title).toBe('Dashboard')
  })
})
