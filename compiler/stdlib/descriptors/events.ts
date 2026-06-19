import { stringListIncludes } from './string-list.ts'

export const unsupportedEventsRuntimeExports: string[] = [
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
  if (source !== 'node:events') {
    return false
  }

  return true
}

export function isUnsupportedEventsRuntimeExport(name: string): boolean {
  return stringListIncludes(unsupportedEventsRuntimeExports, name)
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
