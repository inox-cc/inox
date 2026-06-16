import {
  implementedRuntimeBuiltinImportSources,
  unsupportedRuntimeBuiltinImportSources
} from './stdlib/descriptors/node-builtins.ts'

export const runtimeBuiltinImportSources = createRuntimeBuiltinImportSources()

function createRuntimeBuiltinImportSources(): Set<string> {
  const sources: Set<string> = new Set()

  for (const specifier of implementedRuntimeBuiltinImportSources) {
    sources.add(specifier)
  }

  for (const specifier of unsupportedRuntimeBuiltinImportSources) {
    sources.add(specifier)
  }

  return sources
}

export function isRuntimeBuiltinImportSource(specifier: string): boolean {
  return runtimeBuiltinImportSources.has(specifier)
}
