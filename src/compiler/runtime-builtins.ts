import {
  implementedRuntimeBuiltinImportSources,
  unsupportedRuntimeBuiltinImportSources
} from './stdlib/descriptors/node-builtins.ts'

export const runtimeBuiltinImportSources = new Set<string>([
  ...implementedRuntimeBuiltinImportSources,
  ...unsupportedRuntimeBuiltinImportSources
])

export function isRuntimeBuiltinImportSource(specifier: string): boolean {
  return runtimeBuiltinImportSources.has(specifier)
}
