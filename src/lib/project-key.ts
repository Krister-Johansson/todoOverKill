/**
 * Suggests a project key from a project name, following projectKeySchema: 2
 * to 10 upper-case letters or digits, starting with a letter. A name of
 * several words gives its initials ("todo Over Kill" is TOK); a single word
 * gives its first three characters ("Website" is WEB). Returns an empty
 * string when the name has no usable letters, so the user types a key.
 */
export function suggestProjectKey(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
  if (words.length === 0) return ''

  const initials = withLeadingLetter(words.map((word) => word[0]).join(''))
  if (words.length > 1 && initials.length >= 2) return initials.slice(0, 10)

  const start = withLeadingLetter(words.join(''))
  return start.length >= 2 ? start.slice(0, 3) : ''
}

function withLeadingLetter(value: string) {
  return value.replace(/^[0-9]+/, '')
}
