import assert from 'node:assert/strict'

import { compileSource } from '../../compiler/core.ts'
import { formatDiagnostics } from '../../compiler/diagnostics.ts'
import type { Diagnostic } from '../../compiler/types.ts'

export function assertClassSuperDiagnosticUsesInheritanceCode(): void {
  const diagnostics = compileDiagnostics(`
class Base {
  label(): string {
    return 'base'
  }
}

class User extends Base {
  label(): string {
    return super.label()
  }
}
`)
  const codes = diagnostics.map((item) => item.code)

  assert.deepEqual(codes, ['INOX_CLASS_EXTENDS', 'INOX_CLASS_EXTENDS'], formatDiagnostics(diagnostics))
}

function compileDiagnostics(source: string): Diagnostic[] {
  try {
    compileSource(source, {
      target: 'cc'
    })
  } catch (error) {
    if (hasDiagnostics(error)) {
      return error.diagnostics
    }

    throw error
  }

  assert.fail('expected compiler diagnostics')
}

function hasDiagnostics(error: unknown): error is { diagnostics: Diagnostic[] } {
  if (typeof error !== 'object' || error === null || !('diagnostics' in error)) {
    return false
  }

  const diagnostics = (error as { diagnostics?: unknown }).diagnostics

  return Array.isArray(diagnostics)
}
