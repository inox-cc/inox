import {
  dateConstructorRuntimeMethodNameFromPath,
  dateInstanceRuntimeMethodName,
  dateInstanceRuntimeMethodReturnType,
  timeRuntimeMethodNameFromPath
} from './descriptor.ts'
import type { SymbolInfo, ValueType } from '../../../../compiler/types.ts'

export type TimeRuntimeCallInfo = {
  method: string
  root: string
  member: string
}

export type DateInstanceRuntimeMethodInfo = {
  method: string
  returnType: ValueType
}

export function timeRuntimeCallInfo(
  path: readonly string[] | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): TimeRuntimeCallInfo | null {
  if (path === null || typeof path === 'undefined' || path.length < 2 || runtimeGlobalIsShadowed(rootSymbol)) {
    return null
  }

  const method = timeRuntimeMethodNameFromPath(copyPath(path))

  if (method === null || typeof method === 'undefined') {
    return null
  }

  return {
    method,
    root: path[0],
    member: path[1]
  }
}

export function dateInstanceRuntimeMethodInfo(
  methodName: string | null | undefined
): DateInstanceRuntimeMethodInfo | null {
  const method = dateInstanceRuntimeMethodName(methodName)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  const returnType = dateInstanceRuntimeMethodReturnType(method)

  if (returnType === 'string' || returnType === 'number') {
    return {
      method,
      returnType
    }
  }

  return {
    method,
    returnType: 'number'
  }
}

export function isDateConstructorRuntimeExpression(
  path: readonly string[] | null | undefined,
  dateSymbol: SymbolInfo | null | undefined
): boolean {
  if (runtimeGlobalIsShadowed(dateSymbol)) {
    return false
  }

  const method = dateConstructorRuntimeMethodNameFromPath(copyPathOrNull(path))

  return method !== null && typeof method !== 'undefined'
}

function runtimeGlobalIsShadowed(symbol: SymbolInfo | null | undefined): boolean {
  return symbol !== null && typeof symbol !== 'undefined' && symbol.kind !== 'global'
}

function copyPath(path: readonly string[]): string[] {
  const result: string[] = []

  for (const part of path) {
    result.push(part)
  }

  return result
}

function copyPathOrNull(path: readonly string[] | null | undefined): string[] | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  return copyPath(path)
}
