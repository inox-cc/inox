export const runtimeBuiltinImportSources = new Set([
  'dgram',
  'fs',
  'http',
  'net',
  'node:dgram',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:net'
])

export function isRuntimeBuiltinImportSource(specifier: string): boolean {
  return runtimeBuiltinImportSources.has(specifier)
}
