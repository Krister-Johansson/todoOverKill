// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { composePostgresImage } from './prepare-test-database.ts'

describe('composePostgresImage', () => {
  it('reads the image of the compose db service', () => {
    const compose = readFileSync('docker-compose.yml', 'utf8')

    expect(composePostgresImage(compose)).toMatch(/^postgres:\d+/)
  })

  it('keeps a quoted tag with a variant', () => {
    const compose = "services:\n  db:\n    image: 'postgres:17-alpine'\n"

    expect(composePostgresImage(compose)).toBe('postgres:17-alpine')
  })

  it.each([
    ['no image line', 'services:\n  db:\n    restart: always\n'],
    ['another image', 'services:\n  db:\n    image: mysql:8\n'],
    [
      'a tag without a version',
      'services:\n  db:\n    image: postgres:latest\n',
    ],
  ])('fails with a clear message on %s', (_, compose) => {
    expect(() => composePostgresImage(compose)).toThrow(
      'docker-compose.yml has no `image: postgres:<version>` line.',
    )
  })
})
