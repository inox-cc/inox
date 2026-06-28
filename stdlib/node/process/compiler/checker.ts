import { isNodeStdlibRuntimeImportBinding } from '../../../../compiler/stdlib/node/descriptor.ts'
import {
  isNodeProcessImportSource,
  isProcessRuntimeMethod,
  isProcessRuntimeProperty,
  isUnsupportedProcessRuntimeMethod,
  isUnsupportedProcessRuntimeProperty,
  processRuntimePropertyValueType
} from './descriptor.ts'
import type { SymbolInfo, ValueType } from '../../../../compiler/types.ts'

export type ProcessRuntimeCallInfo = {
  method: string
  label: string
  unsupported: boolean
}

export type ProcessRuntimePropertyInfo = {
  property: string
  valueType: ValueType
}

export type ProcessRuntimeMemberInfo =
  | {
      kind: 'property'
      property: string
      valueType: ValueType
    }
  | {
      kind: 'env-name'
      name: string
    }
  | {
      kind: 'unsupported-property'
      property: string
    }

export function processRuntimeCallInfo(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): ProcessRuntimeCallInfo | null {
  const method = processRuntimeMethodName(importedName, moduleObjectMemberName)

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
    unsupported: !isProcessRuntimeMethod(method)
  }
}

export function processRuntimePropertyImportInfo(
  source: string | null | undefined,
  importedName: string | null | undefined
): ProcessRuntimePropertyInfo | null {
  if (
    importedName !== null &&
    typeof importedName !== 'undefined' &&
    isNodeProcessImportSource(source) &&
    isProcessRuntimeProperty(importedName)
  ) {
    return processRuntimePropertyInfo(importedName)
  }

  return null
}

export function processRuntimeMemberInfo(
  path: readonly string[] | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): ProcessRuntimeMemberInfo | null {
  if (
    path === null ||
    typeof path === 'undefined' ||
    path.length < 1 ||
    rootSymbol === null ||
    typeof rootSymbol === 'undefined' ||
    !isProcessImportSymbol(rootSymbol)
  ) {
    return null
  }

  const root = rootSymbol

  if (isProcessModuleObjectImportSymbol(root)) {
    return processModuleObjectMemberInfo(path)
  }

  if (path.length === 2 && root.importedName === 'env') {
    return {
      kind: 'env-name',
      name: path[1]
    }
  }

  if (path.length === 2 && root.importedName !== null && typeof root.importedName !== 'undefined') {
    return processRuntimePropertyInfoOrNull(`${root.importedName}.${path[1]}`)
  }

  return null
}

export function processRuntimeAssignmentProperty(
  path: readonly string[] | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): string | null {
  if (
    path !== null &&
    typeof path !== 'undefined' &&
    path.length === 2 &&
    path[1] === 'exitCode' &&
    isProcessModuleObjectImportSymbol(rootSymbol)
  ) {
    return 'exitCode'
  }

  return null
}

export function processRuntimeIndexProperty(
  path: readonly string[] | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): string | null {
  if (
    path === null ||
    typeof path === 'undefined' ||
    rootSymbol === null ||
    typeof rootSymbol === 'undefined' ||
    !isProcessImportSymbol(rootSymbol)
  ) {
    return null
  }

  const root = rootSymbol

  if (
    (isProcessModuleObjectImportSymbol(root) && path.length === 2 && path[1] === 'argv') ||
    (root.importedName === 'argv' && path.length === 1)
  ) {
    return 'argv'
  }

  return null
}

function processRuntimeMethodName(
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): string | null {
  if (importedName !== null && typeof importedName !== 'undefined') {
    return knownProcessRuntimeMethodName(importedName)
  }

  if (moduleObjectMemberName !== null && typeof moduleObjectMemberName !== 'undefined') {
    return knownProcessRuntimeMethodName(moduleObjectMemberName)
  }

  return null
}

function processModuleObjectMemberInfo(path: readonly string[]): ProcessRuntimeMemberInfo | null {
  if (path.length === 2 && isUnsupportedProcessRuntimeProperty(path[1])) {
    return {
      kind: 'unsupported-property',
      property: path[1]
    }
  }

  if (path.length === 2) {
    return processRuntimePropertyInfoOrNull(path[1])
  }

  if (path.length === 3 && path[1] === 'env') {
    return {
      kind: 'env-name',
      name: path[2]
    }
  }

  if (path.length === 3) {
    return processRuntimePropertyInfoOrNull(`${path[1]}.${path[2]}`)
  }

  return null
}

function processRuntimePropertyInfoOrNull(property: string): ProcessRuntimeMemberInfo | null {
  if (isProcessRuntimeProperty(property)) {
    return {
      kind: 'property',
      property,
      valueType: processRuntimePropertyConcreteValueType(property)
    }
  }

  return null
}

function processRuntimePropertyInfo(property: string): ProcessRuntimePropertyInfo {
  return {
    property,
    valueType: processRuntimePropertyConcreteValueType(property)
  }
}

function processRuntimePropertyConcreteValueType(property: string): ValueType {
  const valueType = processRuntimePropertyValueType(property)

  if (valueType === 'string' || valueType === 'number' || valueType === 'object') {
    return valueType
  }

  return 'unknown'
}

function knownProcessRuntimeMethodName(method: string): string | null {
  if (isProcessRuntimeMethod(method) || isUnsupportedProcessRuntimeMethod(method)) {
    return method
  }

  return null
}

function isProcessImportSymbol(symbol: SymbolInfo | null | undefined): boolean {
  return (
    symbol !== null &&
    typeof symbol !== 'undefined' &&
    symbol.kind === 'import' &&
    isNodeProcessImportSource(symbol.importSource)
  )
}

function isProcessModuleObjectImportSymbol(symbol: SymbolInfo | null | undefined): boolean {
  return (
    symbol !== null &&
    typeof symbol !== 'undefined' &&
    symbol.kind === 'import' &&
    isNodeStdlibRuntimeImportBinding(symbol.importSource, 'process', 'module-object', symbol.importedName)
  )
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
