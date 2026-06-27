import {
  isNodeTimerImportSource,
  isTimerClearMethod,
  isTimerRuntimeMethod,
  timerRuntimeMethodNameFromPath
} from '../../stdlib/descriptors/timers.ts'
import type { AnyNode, SymbolInfo } from '../../types.ts'

export function timerRuntimeMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return timerRuntimeMethodNameFromPath(callee.path)
}

export function timerClearMethodName(method: string): string | null {
  if (isTimerClearMethod(method)) {
    return method
  }

  return null
}

export function timerRuntimeImportMethodName(
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): string | null {
  if (importedName !== null && typeof importedName !== 'undefined') {
    return knownTimerRuntimeMethodName(importedName)
  }

  if (moduleObjectMemberName !== null && typeof moduleObjectMemberName !== 'undefined') {
    return knownTimerRuntimeMethodName(moduleObjectMemberName)
  }

  return null
}

export function isTimerRuntimeImportSymbol(
  symbol: SymbolInfo | null | undefined,
  method: string
): boolean {
  return (
    symbol !== null &&
    typeof symbol !== 'undefined' &&
    symbol.kind === 'import' &&
    symbol.importSource !== null &&
    typeof symbol.importSource !== 'undefined' &&
    isNodeTimerImportSource(symbol.importSource) &&
    symbol.importedName === method
  )
}

const timerCallbackType: AnyNode = {
  kind: 'function',
  resolved: true,
  params: [],
  declaredReturnType: 'void',
  returnType: 'void',
  returnNullable: false
}

export function timerCallbackFunctionType(): AnyNode {
  return timerCallbackType
}

function knownTimerRuntimeMethodName(name: string): string | null {
  if (isTimerRuntimeMethod(name)) {
    return name
  }

  return null
}
