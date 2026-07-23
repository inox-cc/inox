import { diagnostic } from '../../diagnostics.ts'
import type { Diagnostic, IrGlobalUsage, IrSyntaxFeatureUsage, SourceLocation } from '../../types.ts'

export function reportUnsupportedCSyntaxFeatures(
  _syntaxFeatures: IrSyntaxFeatureUsage[],
  _diagnostics: Diagnostic[]
): void {}

export function reportUnsupportedCGlobalUsages(globalUsages: IrGlobalUsage[], diagnostics: Diagnostic[]): void {
  for (let index = 0; index < globalUsages.length; index = index + 1) {
    const usage = globalUsages[index] as IrGlobalUsage

    reportCJsGlobalDiagnostic(diagnostics, usage.loc)
  }
}

export function reportCJsGlobalDiagnostic(diagnostics: Diagnostic[], loc: SourceLocation | null | undefined): void {
  if (hasCJsGlobalDiagnosticAtLocation(diagnostics, loc)) {
    return
  }

  diagnostics.push(
    diagnostic('INOX_C_JS_GLOBAL', 'this JS global is not supported by the current C++ backend slice', loc)
  )
}

function hasCJsGlobalDiagnosticAtLocation(diagnostics: Diagnostic[], loc: SourceLocation | null | undefined): boolean {
  for (let index = 0; index < diagnostics.length; index = index + 1) {
    const item = diagnostics[index]

    if (item.code === 'INOX_C_JS_GLOBAL' && sameLocation(item, loc)) {
      return true
    }
  }

  return false
}

function sameLocation(left: SourceLocation | undefined, right: SourceLocation | null | undefined): boolean {
  if (left === null || typeof left === 'undefined' || right === null || typeof right === 'undefined') {
    return (left === null || typeof left === 'undefined') && (right === null || typeof right === 'undefined')
  }

  return left.line === right.line && left.column === right.column
}
