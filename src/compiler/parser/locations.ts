import type { SourceLocation } from '../types.ts'

export function locFromToken(token: SourceLocation): SourceLocation {
  const file = token.file
  const location: SourceLocation = {
    line: token.line,
    column: token.column
  }

  if (file !== null && typeof file !== 'undefined') {
    location.file = file
  }

  return location
}
