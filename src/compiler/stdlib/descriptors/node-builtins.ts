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
] as const

export const unsupportedRuntimeBuiltinImportSources = [
  'node:dns',
  'node:https',
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
