export const implementedRuntimeBuiltinImportSources: string[] = [
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

export const unsupportedRuntimeBuiltinImportSources: string[] = [
  'node:dns',
  'node:https',
  'node:timers/promises',
  'node:tls',
  'node:worker_threads',
  'node:zlib'
]

const unsupportedRuntimeBuiltinImportSet = createUnsupportedRuntimeBuiltinImportSet()

function createUnsupportedRuntimeBuiltinImportSet(): Set<string> {
  const sources: Set<string> = new Set()

  for (const source of unsupportedRuntimeBuiltinImportSources) {
    sources.add(source)
  }

  return sources
}

export function unsupportedRuntimeBuiltinImportMessage(source: string): string | null {
  if (!unsupportedRuntimeBuiltinImportSet.has(source)) {
    return null
  }

  return `${source} is recognized but not implemented by the current C backend`
}
