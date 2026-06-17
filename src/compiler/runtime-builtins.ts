export const runtimeBuiltinImportSources = createRuntimeBuiltinImportSources()

function createRuntimeBuiltinImportSources(): Set<string> {
  const sources: Set<string> = new Set()

  sources.add('dgram')
  sources.add('fs')
  sources.add('http')
  sources.add('net')
  sources.add('node:path')
  sources.add('node:buffer')
  sources.add('node:crypto')
  sources.add('node:child_process')
  sources.add('node:dgram')
  sources.add('node:events')
  sources.add('node:fs')
  sources.add('node:fs/promises')
  sources.add('node:http')
  sources.add('node:net')
  sources.add('node:os')
  sources.add('node:stream')
  sources.add('node:timers')
  sources.add('node:url')
  sources.add('node:process')
  sources.add('node:dns')
  sources.add('node:https')
  sources.add('node:timers/promises')
  sources.add('node:tls')
  sources.add('node:worker_threads')
  sources.add('node:zlib')

  return sources
}

export function isRuntimeBuiltinImportSource(specifier: string): boolean {
  return runtimeBuiltinImportSources.has(specifier)
}
