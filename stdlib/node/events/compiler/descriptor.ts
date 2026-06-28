import { nodeStringListIncludes } from '../../../../compiler/stdlib/node/string-list.ts'

export const nodeEventsImportSource = 'node:events'
export const nodeEventsModuleObjectImportNames = ['default', 'events']

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
]

export function isNodeEventsImportSource(source: string | null | undefined): boolean {
  return source === nodeEventsImportSource
}

export function isUnsupportedEventsRuntimeExport(name: string): boolean {
  return nodeStringListIncludes(unsupportedEventsRuntimeExports, name)
}

export function unsupportedEventsRuntimeExportReason(name: string): string {
  if (name === 'EventEmitter' || name === 'EventEmitterAsyncResource') {
    return 'event dispatch and listener lifetime support are not implemented by the current C++ backend'
  }

  if (name === 'once' || name === 'on' || name === 'addAbortListener') {
    return 'async event iterator/listener helpers need EventEmitter runtime support'
  }

  return 'node:events runtime support is not implemented by the current C++ backend'
}
