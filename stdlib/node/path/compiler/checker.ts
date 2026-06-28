import { isNodeStdlibRuntimeImportBinding } from '../../../../compiler/stdlib/node/descriptor.ts'
import {
  isNodePathImportSource,
  isPathRuntimeConstant,
  isPathRuntimeMethod,
  isUnsupportedPathRuntimeMethod
} from './descriptor.ts'
import type { SymbolInfo } from '../../../../compiler/types.ts'

export type PathRuntimeCallInfo = {
  method: string
  label: string
  unsupported: boolean
}

export function isPathRuntimeConstantImport(source: string | null | undefined, importedName: string): boolean {
  return isNodePathImportSource(source) && isPathRuntimeConstant(importedName)
}

export function pathRuntimeCallInfo(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): PathRuntimeCallInfo | null {
  const method = pathRuntimeMethodName(path, importedName, moduleObjectMemberName, rootSymbol)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  let label = method

  if (path !== null && typeof path !== 'undefined') {
    label = joinStrings(path, '.')
  }

  return {
    method,
    label,
    unsupported: !isPathRuntimeMethod(method)
  }
}

export function pathRuntimeMethodName(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): string | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  if (importedName !== null && typeof importedName !== 'undefined') {
    return knownPathRuntimeMethodName(importedName)
  }

  if (moduleObjectMemberName !== null && typeof moduleObjectMemberName !== 'undefined') {
    return knownPathRuntimeMethodName(moduleObjectMemberName)
  }

  const posixMemberName = pathPosixMemberName(path, rootSymbol)

  if (posixMemberName !== null && typeof posixMemberName !== 'undefined') {
    return knownPathRuntimeMethodName(posixMemberName)
  }

  return null
}

export function pathRuntimeConstantName(
  path: readonly string[] | null | undefined,
  moduleObjectMemberName: string | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): string | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  if (
    moduleObjectMemberName !== null &&
    typeof moduleObjectMemberName !== 'undefined' &&
    isPathRuntimeConstant(moduleObjectMemberName)
  ) {
    return moduleObjectMemberName
  }

  const posixMemberName = pathPosixMemberName(path, rootSymbol)

  if (posixMemberName !== null && typeof posixMemberName !== 'undefined' && isPathRuntimeConstant(posixMemberName)) {
    return posixMemberName
  }

  return null
}

function knownPathRuntimeMethodName(name: string): string | null {
  if (isPathRuntimeMethod(name) || isUnsupportedPathRuntimeMethod(name)) {
    return name
  }

  return null
}

function pathPosixMemberName(
  path: readonly string[],
  rootSymbol: SymbolInfo | null | undefined
): string | null {
  if (rootSymbol === null || typeof rootSymbol === 'undefined' || rootSymbol.kind !== 'import') {
    return null
  }

  if (
    path.length === 2 &&
    isNodePathImportSource(rootSymbol.importSource) &&
    rootSymbol.importedName === 'posix'
  ) {
    return path[1]
  }

  if (
    path.length === 3 &&
    path[1] === 'posix' &&
    isNodeStdlibRuntimeImportBinding(rootSymbol.importSource, 'path', 'module-object', rootSymbol.importedName)
  ) {
    return path[2]
  }

  return null
}

function joinStrings(values: readonly string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = `${result}${separator}`
    }

    result = `${result}${values[index]}`
  }

  return result
}
