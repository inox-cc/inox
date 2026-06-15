export const implementedRuntimeBuiltinImportSources = [
  'dgram',
  'fs',
  'http',
  'net',
  'node:path',
  'node:crypto',
  'node:child_process',
  'node:dgram',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:net',
  'node:url',
  'node:process'
] as const

export const unsupportedRuntimeBuiltinImportSources = [
  'node:buffer',
  'node:dns',
  'node:events',
  'node:https',
  'node:os',
  'node:stream',
  'node:timers',
  'node:timers/promises',
  'node:tls',
  'node:worker_threads',
  'node:zlib'
] as const

const unsupportedRuntimeBuiltinImportSet = new Set<string>(unsupportedRuntimeBuiltinImportSources)

export function unsupportedRuntimeBuiltinImportMessage(source: string): string | null {
  if (!unsupportedRuntimeBuiltinImportSet.has(source)) {
    return null
  }

  return `${source} is recognized but not implemented by the current C backend`
}
