import { stringListIncludes } from './string-list.ts'

export const unsupportedStreamRuntimeExports: string[] = [
  'Readable',
  'Writable',
  'Duplex',
  'Transform',
  'PassThrough',
  'Stream',
  'finished',
  'pipeline',
  'promises.finished',
  'promises.pipeline'
]

const nodeStreamImportSources: string[] = ['node:stream']

export function isNodeStreamImportSource(source: string | null | undefined): boolean {
  return source != null && stringListIncludes(nodeStreamImportSources, source)
}

export function isUnsupportedStreamRuntimeExport(name: string): boolean {
  return stringListIncludes(unsupportedStreamRuntimeExports, name)
}

export function unsupportedStreamRuntimeExportReason(name: string): string {
  if (name === 'Readable' || name === 'Writable' || name === 'Duplex' || name === 'Transform' || name === 'PassThrough') {
    return 'stream buffering and backpressure support are not implemented by the current C backend'
  }

  if (name === 'pipeline' || name === 'promises.pipeline') {
    return 'stream pipeline orchestration needs stream runtime support'
  }

  if (name === 'finished' || name === 'promises.finished') {
    return 'stream completion tracking needs stream runtime support'
  }

  return 'node:stream runtime support is not implemented by the current C backend'
}
