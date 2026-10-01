import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'

import type { Page } from '@playwright/test'

type Violation = Awaited<
  ReturnType<AxeBuilder['analyze']>
>['violations'][number]

/**
 * The axe tags from docs/accessibility.md. axe has no wcag22aaa tag: the WCAG
 * 2.2 additions it can check are all level A or AA.
 */
export const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag2aaa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
]

/** One block per violation, listing every element that failed and why. */
export function formatViolations(violations: Array<Violation>) {
  return violations
    .map((violation) =>
      [
        `${violation.id} (${violation.impact ?? 'unknown impact'}): ${violation.help}`,
        violation.helpUrl,
        ...violation.nodes.map((node) =>
          [
            `  ${node.target.join(' ')}`,
            ...(node.failureSummary ?? '')
              .split('\n')
              .map((line) => `    ${line}`),
          ].join('\n'),
        ),
      ].join('\n'),
    )
    .join('\n\n')
}

/**
 * Runs axe on the current page with the WCAG 2.2 AAA tag set and fails on any
 * violation. `exclude` takes CSS selectors to leave out, for third-party
 * content the app does not control.
 */
export async function expectAccessible(
  page: Page,
  options: { exclude?: Array<string> } = {},
) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS)
  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(selector)
  }
  const { violations } = await builder.analyze()

  expect(violations, formatViolations(violations)).toEqual([])
}
