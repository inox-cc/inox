import { isNodeStdlibRuntimeImportBinding } from '../../compiler/descriptor.ts'
import type { SymbolInfo } from '../../../../compiler/types.ts'
import { isUnsupportedStreamRuntimeExport, unsupportedStreamRuntimeExportReason } from './descriptor.ts'

export type UnsupportedStreamRuntimeExport = {
  source: string
  name: string
  reason: string
}

export function unsupportedStreamRuntimeExport(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): UnsupportedStreamRuntimeExport | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  if (path.length === 1) {
    return unsupportedStreamUsage(importedName)
  }

  if (rootSymbol === null || typeof rootSymbol === 'undefined' || rootSymbol.kind !== 'import') {
    return null
  }

  if (
    path.length === 2 &&
    isNodeStdlibRuntimeImportBinding(rootSymbol.importSource, 'stream', 'module-object', rootSymbol.importedName)
  ) {
    return unsupportedStreamUsage(path[1])
  }

  if (
    path.length === 3 &&
    path[1] === 'promises' &&
    isNodeStdlibRuntimeImportBinding(rootSymbol.importSource, 'stream', 'module-object', rootSymbol.importedName)
  ) {
    return unsupportedStreamUsage(`promises.${path[2]}`)
  }

  return null
}

function unsupportedStreamUsage(name: string | null | undefined): UnsupportedStreamRuntimeExport | null {
  if (name === null || typeof name === 'undefined' || !isUnsupportedStreamRuntimeExport(name)) {
    return null
  }

  return {
    source: 'node:stream',
    name,
    reason: unsupportedStreamRuntimeExportReason(name)
  }
}
