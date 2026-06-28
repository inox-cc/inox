import { isNodeStdlibRuntimeImportBinding } from '../../../../compiler/stdlib/node/descriptor.ts'
import type { SymbolInfo } from '../../../../compiler/types.ts'
import { isUnsupportedEventsRuntimeExport, unsupportedEventsRuntimeExportReason } from './descriptor.ts'

export type UnsupportedEventsRuntimeExport = {
  source: string
  name: string
  reason: string
}

export function unsupportedEventsRuntimeExport(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): UnsupportedEventsRuntimeExport | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  if (path.length === 1) {
    return unsupportedEventsUsage(importedName)
  }

  if (rootSymbol === null || typeof rootSymbol === 'undefined' || rootSymbol.kind !== 'import') {
    return null
  }

  if (
    path.length === 2 &&
    isNodeStdlibRuntimeImportBinding(rootSymbol.importSource, 'events', 'module-object', rootSymbol.importedName)
  ) {
    return unsupportedEventsUsage(path[1])
  }

  return null
}

function unsupportedEventsUsage(name: string | null | undefined): UnsupportedEventsRuntimeExport | null {
  if (name === null || typeof name === 'undefined' || !isUnsupportedEventsRuntimeExport(name)) {
    return null
  }

  return {
    source: 'node:events',
    name,
    reason: unsupportedEventsRuntimeExportReason(name)
  }
}
