import { isNodeStdlibRuntimeImportBinding } from '../../compiler/descriptor.ts'
import {
  binaryConstructorNameFromPath,
  binaryInstanceRuntimeMethodName as descriptorBinaryInstanceRuntimeMethodName,
  isBinaryStaticMethod,
  isBufferRuntimeConstant,
  isNodeBufferImportSource,
  isUnsupportedBufferRuntimeExport
} from './descriptor.ts'
import type { SymbolInfo } from '../../../../compiler/types.ts'

export function binaryStaticRuntimeMethodName(
  path: readonly string[] | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): string | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  if (path.length === 2 && path[0] === 'Buffer') {
    if (rootSymbol === null || typeof rootSymbol === 'undefined') {
      return knownBinaryStaticRuntimeMethodName(path[1])
    }

    if (isBufferConstructorImportSymbol(rootSymbol)) {
      return knownBinaryStaticRuntimeMethodName(path[1])
    }

    return null
  }

  if (path.length === 3 && path[1] === 'Buffer' && isBufferModuleObjectImportSymbol(rootSymbol)) {
    return knownBinaryStaticRuntimeMethodName(path[2])
  }

  return null
}

export function binaryInstanceRuntimeMethodName(method: string): string | null {
  return descriptorBinaryInstanceRuntimeMethodName(method)
}

export function binaryConstructorName(path: readonly string[] | null | undefined): string | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  return binaryConstructorNameFromPath(copyPath(path))
}

export function unsupportedBufferRuntimeExport(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): string | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  if (importedName !== null && typeof importedName !== 'undefined') {
    return knownUnsupportedBufferRuntimeExport(importedName)
  }

  if (path.length === 2 && isBufferModuleObjectImportSymbol(rootSymbol)) {
    return knownUnsupportedBufferRuntimeExport(path[1])
  }

  return null
}

export function bufferRuntimeConstantName(
  path: readonly string[] | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): string | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  if (path.length === 2 && isBufferConstantsImportSymbol(rootSymbol)) {
    return knownBufferRuntimeConstantName(path[1])
  }

  if (path.length === 3 && path[1] === 'constants' && isBufferModuleObjectImportSymbol(rootSymbol)) {
    return knownBufferRuntimeConstantName(path[2])
  }

  return null
}

function isBufferConstructorImportSymbol(symbol: SymbolInfo | null | undefined): boolean {
  return (
    symbol !== null &&
    typeof symbol !== 'undefined' &&
    symbol.kind === 'import' &&
    isNodeBufferImportSource(symbol.importSource) &&
    symbol.importedName === 'Buffer'
  )
}

function isBufferConstantsImportSymbol(symbol: SymbolInfo | null | undefined): boolean {
  return (
    symbol !== null &&
    typeof symbol !== 'undefined' &&
    symbol.kind === 'import' &&
    isNodeBufferImportSource(symbol.importSource) &&
    symbol.importedName === 'constants'
  )
}

function isBufferModuleObjectImportSymbol(symbol: SymbolInfo | null | undefined): boolean {
  return (
    symbol !== null &&
    typeof symbol !== 'undefined' &&
    symbol.kind === 'import' &&
    isNodeStdlibRuntimeImportBinding(symbol.importSource, 'buffer', 'module-object', symbol.importedName)
  )
}

function knownBinaryStaticRuntimeMethodName(method: string): string | null {
  if (isBinaryStaticMethod(method)) {
    return method
  }

  return null
}

function knownBufferRuntimeConstantName(name: string): string | null {
  if (isBufferRuntimeConstant(name)) {
    return name
  }

  return null
}

function knownUnsupportedBufferRuntimeExport(name: string): string | null {
  if (isUnsupportedBufferRuntimeExport(name)) {
    return name
  }

  return null
}

function copyPath(path: readonly string[]): string[] {
  const result: string[] = []

  for (const part of path) {
    result.push(part)
  }

  return result
}
