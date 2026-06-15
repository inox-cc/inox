export const unsupportedEventsRuntimeExports = [
  'EventEmitter',
  'EventEmitterAsyncResource',
  'addAbortListener',
  'captureRejectionSymbol',
  'defaultMaxListeners',
  'errorMonitor',
  'getEventListeners',
  'getMaxListeners',
  'listenerCount',
  'on',
  'once',
  'setMaxListeners'
] as const

const nodeEventsImportSources = new Set(['node:events'])
const unsupportedEventsRuntimeExportSet = new Set<string>(unsupportedEventsRuntimeExports)

export function isNodeEventsImportSource(source: string | null | undefined): boolean {
  return source != null && nodeEventsImportSources.has(source)
}

export function isUnsupportedEventsRuntimeExport(name: string): boolean {
  return unsupportedEventsRuntimeExportSet.has(name)
}

export function unsupportedEventsRuntimeExportReason(name: string): string {
  if (name === 'EventEmitter' || name === 'EventEmitterAsyncResource') {
    return 'event dispatch and listener lifetime support are not implemented by the current C backend'
  }

  if (name === 'once' || name === 'on' || name === 'addAbortListener') {
    return 'async event iterator/listener helpers need EventEmitter runtime support'
  }

  return 'node:events runtime support is not implemented by the current C backend'
}
