import {
  isStdlibModuleImportSource,
  stdlibModuleImportSourceAt,
  stdlibModuleImportSourceCount
} from './stdlib/node/modules.ts'

export const runtimeBuiltinImportSources: Set<string> = createRuntimeBuiltinImportSources()

function createRuntimeBuiltinImportSources(): Set<string> {
  const sources: Set<string> = new Set()

  for (let index = 0; index < stdlibModuleImportSourceCount(); index = index + 1) {
    sources.add(stdlibRuntimeBuiltinImportSourceAt(index))
  }

  return sources
}

export function isRuntimeBuiltinImportSource(specifier: string): boolean {
  return isStdlibModuleImportSource(specifier)
}

function stdlibRuntimeBuiltinImportSourceAt(index: number): string {
  return stdlibModuleImportSourceAt(index)
}
