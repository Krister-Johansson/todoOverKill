import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Route } from '#/routes/index'

afterEach(cleanup)

describe('index route', () => {
  it('renders an empty main landmark', () => {
    const Component = Route.options.component!
    render(<Component />)

    const main = screen.getByRole('main')
    expect(main.childElementCount).toBe(0)
  })
})
