import {
  isUnsupportedStdlibModuleImportSource,
  stdlibImplementedModuleImportSources,
  stdlibUnsupportedModuleImportSources,
  unsupportedStdlibModuleImportMessage,
  unsupportedStdlibModuleImportMessageFromKnownSource
} from './modules.ts'

export const implementedRuntimeBuiltinImportSources = stdlibImplementedModuleImportSources
export const unsupportedRuntimeBuiltinImportSources = stdlibUnsupportedModuleImportSources

export function unsupportedRuntimeBuiltinImportMessage(source: string): string | null {
  return unsupportedStdlibModuleImportMessage(source)
}

export function unsupportedRuntimeBuiltinImportMessageFromKnownSource(source: string): string {
  return unsupportedStdlibModuleImportMessageFromKnownSource(source)
}

export function isUnsupportedRuntimeBuiltinImportSource(source: string): boolean {
  return isUnsupportedStdlibModuleImportSource(source)
}
