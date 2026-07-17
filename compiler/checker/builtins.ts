import { stdlibModuleLibuvRuntimeFeature } from '../stdlib/node/modules.ts'

export function libuvOnlyRuntimeImportFeature(source: string): string | null {
  return stdlibModuleLibuvRuntimeFeature(source)
}
