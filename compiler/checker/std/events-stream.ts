import { isUnsupportedEventsRuntimeExport, unsupportedEventsRuntimeExportReason } from '../../stdlib/descriptors/events.ts'
import { isStdlibModuleRuntimeImportBinding } from '../../stdlib/descriptors/modules.ts'
import { isUnsupportedStreamRuntimeExport, unsupportedStreamRuntimeExportReason } from '../../stdlib/descriptors/stream.ts'
import type { SymbolInfo } from '../../types.ts'

export type UnsupportedEventStreamRuntimeExport = {
  source: string
  name: string
  reason: string
}

export function unsupportedEventStreamRuntimeExport(
  path: readonly string[] | null | undefined,
  eventsImportedName: string | null | undefined,
  streamImportedName: string | null | undefined,
  rootSymbol: SymbolInfo | null | undefined
): UnsupportedEventStreamRuntimeExport | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  if (path.length === 1) {
    const eventsUsage = unsupportedEventsUsage(eventsImportedName)

    if (eventsUsage !== null && typeof eventsUsage !== 'undefined') {
      return eventsUsage
    }

    const streamUsage = unsupportedStreamUsage(streamImportedName)

    if (streamUsage !== null && typeof streamUsage !== 'undefined') {
      return streamUsage
    }
  }

  if (rootSymbol === null || typeof rootSymbol === 'undefined' || rootSymbol.kind !== 'import') {
    return null
  }

  if (
    path.length === 2 &&
    isStdlibModuleRuntimeImportBinding(rootSymbol.importSource, 'events', 'module-object', rootSymbol.importedName)
  ) {
    return unsupportedEventsUsage(path[1])
  }

  if (
    path.length === 2 &&
    isStdlibModuleRuntimeImportBinding(rootSymbol.importSource, 'stream', 'module-object', rootSymbol.importedName)
  ) {
    return unsupportedStreamUsage(path[1])
  }

  if (
    path.length === 3 &&
    path[1] === 'promises' &&
    isStdlibModuleRuntimeImportBinding(rootSymbol.importSource, 'stream', 'module-object', rootSymbol.importedName)
  ) {
    return unsupportedStreamUsage(`promises.${path[2]}`)
  }

  return null
}

function unsupportedEventsUsage(name: string | null | undefined): UnsupportedEventStreamRuntimeExport | null {
  if (name === null || typeof name === 'undefined' || !isUnsupportedEventsRuntimeExport(name)) {
    return null
  }

  return {
    source: 'node:events',
    name,
    reason: unsupportedEventsRuntimeExportReason(name)
  }
}

function unsupportedStreamUsage(name: string | null | undefined): UnsupportedEventStreamRuntimeExport | null {
  if (name === null || typeof name === 'undefined' || !isUnsupportedStreamRuntimeExport(name)) {
    return null
  }

  return {
    source: 'node:stream',
    name,
    reason: unsupportedStreamRuntimeExportReason(name)
  }
}
