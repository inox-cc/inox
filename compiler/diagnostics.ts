import type { Diagnostic, SourceLocation } from './types.ts'

export function quoteDiagnosticString(value: string): string {
  return `"${value}"`
}

export class CompileError {
  name: string
  message: string
  diagnostics: Diagnostic[]

  constructor(diagnostics: Diagnostic[]) {
    this.name = 'CompileError'
    this.diagnostics = diagnostics
    this.message = formatDiagnostics(diagnostics)
  }
}

export function diagnostic(code: string, message: string, token?: SourceLocation | null): Diagnostic {
  const result: Diagnostic = {
    code,
    message,
    line: 1,
    column: 1,
    severity: 'error'
  }

  if (token !== null && typeof token !== 'undefined') {
    const file = token.file ?? ''

    if (file !== '') {
      result.file = file
    }

    result.line = token.line
    result.column = token.column
  }

  return result
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  let output = ''

  for (let index = 0; index < diagnostics.length; index++) {
    const item = diagnostics[index]
    let location = `${item.line}:${item.column}`

    if (item.file !== null && typeof item.file !== 'undefined') {
      location = `${item.file}:${item.line}:${item.column}`
    }

    const line = `${location} ${item.code}: ${item.message}`

    if (index === 0) {
      output = line
    } else {
      output = `${output}\n${line}`
    }
  }

  return output
}

export function throwDiagnostics(diagnostics: Diagnostic[]): void {
  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }
}
