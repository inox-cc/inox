import type { SourceLocation } from '../types.ts'

export function locFromToken(token: SourceLocation): SourceLocation {
  return {
    ...(token.file == null ? {} : { file: token.file }),
    line: token.line,
    column: token.column
  }
}
