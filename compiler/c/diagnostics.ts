import { diagnostic } from '../diagnostics.ts'
import {
  dateConstructorRuntimeMethodNameFromPath,
  isCollectionConstructorGlobalUsagePath,
  isDebugRuntimeMethodPath,
  isFetchGlobalRoot,
  jsonRuntimeMethodNameFromPath,
  mathRuntimeMethodNameFromPath,
  timeRuntimeMethodNameFromPath
} from '../../stdlib/global/compiler/descriptor.ts'
import type { Diagnostic, IrGlobalUsage, IrSyntaxFeatureUsage, SourceLocation } from '../types.ts'

export function reportUnsupportedCSyntaxFeatures(
  _syntaxFeatures: IrSyntaxFeatureUsage[],
  _diagnostics: Diagnostic[]
): void {}

export function reportUnsupportedCGlobalUsages(
  globalUsages: IrGlobalUsage[],
  diagnostics: Diagnostic[]
): void {
  for (let index = 0; index < globalUsages.length; index = index + 1) {
    const usage = globalUsages[index] as IrGlobalUsage

    if (!isSupportedCGlobalUsage(usage)) {
      reportCJsGlobalDiagnostic(diagnostics, usage.loc)
    }
  }
}

function isSupportedCGlobalUsage(usage: IrGlobalUsage): boolean {
  const path = joinStrings(usage.path, '.')

  return (
    !!timeRuntimeMethodNameFromPath(usage.path) ||
    !!dateConstructorRuntimeMethodNameFromPath(usage.path) ||
    path === 'Error' ||
    path === 'Promise' ||
    path === 'Promise.resolve' ||
    path === 'Promise.reject' ||
    path === 'Array.from' ||
    path === 'Array.isArray' ||
    path === 'Object.entries' ||
    path === 'Object.keys' ||
    path === 'Object.values' ||
    !!jsonRuntimeMethodNameFromPath(usage.path) ||
    isCollectionConstructorGlobalUsagePath(usage.path) ||
    isSupportedCFetchGlobalUsage(usage) ||
    isSupportedCDebugGlobalUsage(usage) ||
    isSupportedCMathGlobalUsage(usage)
  )
}

function joinStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

export function isSupportedCFetchGlobalUsage(usage: IrGlobalUsage): boolean {
  return usage.path.length === 1 && isFetchGlobalRoot(usage.path[0])
}

export function isSupportedCDebugGlobalUsage(usage: IrGlobalUsage): boolean {
  return isDebugRuntimeMethodPath(usage.path)
}

export function isSupportedCMathGlobalUsage(usage: IrGlobalUsage): boolean {
  return !!mathRuntimeMethodNameFromPath(usage.path)
}

export function reportCJsGlobalDiagnostic(diagnostics: Diagnostic[], loc: SourceLocation | null | undefined): void {
  if (hasCJsGlobalDiagnosticAtLocation(diagnostics, loc)) {
    return
  }

  diagnostics.push(
    diagnostic('INOX_C_JS_GLOBAL', 'this JS global is not supported by the current C backend slice', loc)
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
