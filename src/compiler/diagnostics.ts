import type { Diagnostic, SourceLocation } from './types.ts'

export class CompileError extends Error {
  diagnostics: Diagnostic[]

  constructor(diagnostics: Diagnostic[]) {
    super(formatDiagnostics(diagnostics))
    this.name = 'CompileError'
    this.diagnostics = diagnostics
  }
}

export function diagnostic(code: string, message: string, token?: Partial<SourceLocation>): Diagnostic {
  return {
    code,
    message,
    line: token?.line ?? 1,
    column: token?.column ?? 1,
    severity: 'error'
  }
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics
    .map((item) => {
      return `${item.line}:${item.column} ${item.code}: ${item.message}`
    })
    .join('\n')
}

export function throwDiagnostics(diagnostics: Diagnostic[]): void {
  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }
}
