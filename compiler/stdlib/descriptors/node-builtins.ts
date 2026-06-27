export const implementedRuntimeBuiltinImportSources = [
  'dgram',
  'fs',
  'http',
  'net',
  'node:path',
  'node:buffer',
  'node:crypto',
  'node:child_process',
  'node:dgram',
  'node:events',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:net',
  'node:os',
  'node:stream',
  'node:timers',
  'node:url',
  'node:process'
]

export const unsupportedRuntimeBuiltinImportSources = [
  'node:dns',
  'node:https',
  'node:timers/promises',
  'node:tls',
  'node:worker_threads',
  'node:zlib'
]

export function unsupportedRuntimeBuiltinImportMessage(source: string): string | null {
  if (!isUnsupportedRuntimeBuiltinImportSource(source)) {
    return null
  }

  return unsupportedRuntimeBuiltinImportMessageFromKnownSource(source)
}

export function unsupportedRuntimeBuiltinImportMessageFromKnownSource(source: string): string {
  return `${source} is recognized but not implemented by the current C backend`
}

export function isUnsupportedRuntimeBuiltinImportSource(source: string): boolean {
  if (source === 'node:dns') {
    return true
  }

  if (source === 'node:https') {
    return true
  }

  if (source === 'node:timers/promises') {
    return true
  }

  if (source === 'node:tls') {
    return true
  }

  if (source === 'node:worker_threads') {
    return true
  }

  if (source === 'node:zlib') {
    return true
  }

  return false
}
